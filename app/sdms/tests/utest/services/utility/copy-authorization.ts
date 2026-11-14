import { expect } from 'chai';
import { Request, Response as ExpressResponse } from 'express';
import sinon from 'sinon';
import { Auth, AuthGroups } from '../../../../src/auth';
import { Config, JournalFactoryTenantClient } from '../../../../src/cloud';
import { AzureCosmosDbDAO } from '../../../../src/cloud/providers/azure/cosmosdb';
import { AzureSeistore } from '../../../../src/cloud/providers/azure/seistore';
import { SeistoreFactory } from '../../../../src/cloud/seistore';
import { storageJobManagerInstance } from '../../../../src/cloud/shared/queue';
import { DatasetDAO, DatasetModel } from '../../../../src/services/dataset';
import { lockerInstance } from '../../../../src/services/dataset/locker';
import { SubProjectDAO, SubProjectModel } from '../../../../src/services/subproject';
import { TenantModel, TenantDAO } from '../../../../src/services/tenant';
import { UtilityHandler } from '../../../../src/services/utility/handler';
import { UtilityOP } from '../../../../src/services/utility/optype';
import { Error as ServiceError, FeatureFlags } from '../../../../src/shared';
import { UtilityParser } from '../../../../src/services/utility/parser';
import { Tx } from '../../utils';

function setupCopyFixture(sandbox: sinon.SinonSandbox) {
    function setConfig<K extends keyof typeof Config>(key: K, value: typeof Config[K]) {
        if (key in Config) {
            sandbox.stub(Config, key).value(value);
        } else {
            sandbox.define(Config, key, value);
        }
    }
    setConfig('CLOUDPROVIDER', 'azure');
    setConfig('USER_ID_FROM_PROVIDER_API', true);
    setConfig('FULL_DATA_ACCESS_GROUP', 'users.data.root');
    setConfig('SEISMIC_STORE_NS', 'seismic-store');
    setConfig('DATASETS_KIND', 'datasets');
    sandbox.stub(FeatureFlags, 'isEnabled').returns(false);

    const tenant: TenantModel = { name: 'tenant', esd: 'partition.example', gcpid: '', default_acls: '' };
    const source: SubProjectModel = {
        name: 'source', tenant: tenant.name, admin: '', storage_class: '', storage_location: '',
        ltag: '', gcs_bucket: 'source-bucket', enforce_key: false, access_policy: 'uniform',
        acls: { admins: ['source.admin@partition.example'], viewers: ['source.viewer@partition.example'] }
    };
    const destination: SubProjectModel = {
        ...source, name: 'destination', gcs_bucket: 'destination-bucket',
        acls: { admins: ['destination.admin@partition.example'], viewers: ['destination.viewer@partition.example'] }
    };
    const dataset: DatasetModel = {
        name: 'original', tenant: tenant.name, subproject: source.name, path: '/',
        created_date: '', last_modified_date: '', created_by: '', metadata: {}, filemetadata: {},
        gcsurl: 'source-bucket/original', type: '', ltag: '', ctag: '', sbit: '', sbit_count: 1,
        gtags: [], readonly: false, seismicmeta_guid: '', transfer_status: '', access_policy: 'uniform',
        acls: { admins: ['dataset.admin@partition.example'], viewers: ['dataset.viewer@partition.example'] }
    };
    const journal = sandbox.createStubInstance(AzureCosmosDbDAO);
    journal.createKey.returns({});
    sandbox.stub(JournalFactoryTenantClient, 'get').returns(journal);
    const getTenant = sandbox.stub(TenantDAO, 'get').resolves(tenant);
    const getSubproject = sandbox.stub(SubProjectDAO, 'get').callsFake(async (_journal, _tenant, name) => {
        if (name === source.name) { return source; }
        if (name === destination.name) { return destination; }
        throw new Error(`Unexpected subproject: ${name}`);
    });
    const getDataset = sandbox.stub(DatasetDAO, 'get').callsFake(async (_journal, requested) =>
        [requested.name === dataset.name && requested.subproject === source.name ? dataset : undefined, undefined]);
    const getDatasetByKey = sandbox.stub(DatasetDAO, 'getByKey').callsFake(async (_journal, requested) =>
        requested.name === dataset.name && requested.subproject === source.name ? dataset : undefined);
    const register = sandbox.stub(DatasetDAO, 'register').resolves();
    const storage = sandbox.createStubInstance(AzureSeistore);
    storage.getDatasetStorageResource.resolves('destination-bucket/copied');
    sandbox.stub(SeistoreFactory, 'build').returns(storage);
    sandbox.stub(lockerInstance, 'getLock').resolves(undefined);
    const writeLock = sandbox.stub(lockerInstance, 'createWriteLock').resolves({
        idempotent: false, wid: 'write-lock', mutex: undefined, key: 'destination'
    });
    sandbox.stub(lockerInstance, 'removeWriteLock').resolves();
    const enqueue = sandbox.stub().resolves({ id: 'copy-job' });
    if ('copyJobsQueue' in storageJobManagerInstance) {
        sandbox.stub(storageJobManagerInstance, 'copyJobsQueue').value({ add: enqueue });
    } else {
        sandbox.define(storageJobManagerInstance, 'copyJobsQueue', { add: enqueue });
    }

    function request(destinationName = destination.name): Request {
        const req = Tx.getReq();
        req.query = {
            sdpath_from: `sd://${tenant.name}/${source.name}/${dataset.name}`,
            sdpath_to: `sd://${tenant.name}/${destinationName}/copied`
        };
        return req;
    }

    async function invoke(req: Request): Promise<ExpressResponse> {
        const res = Tx.getRes();
        await UtilityHandler.handler(req, res, UtilityOP.CP);
        return res;
    }

    return {
        tenant, source, destination, dataset, journal, getTenant, getSubproject, getDataset, getDatasetByKey,
        register, storage, writeLock, enqueue, request, invoke
    };
}

describe('Utility copy authorization', () => {
    let sandbox: sinon.SinonSandbox;
    let fixture: ReturnType<typeof setupCopyFixture>;
    let read: sinon.SinonStub;
    let write: sinon.SinonStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        fixture = setupCopyFixture(sandbox);
        read = sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
        write = sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
    });
    afterEach(() => sandbox.restore());

    it('allows distinct subprojects in the same tenant', () => {
        const parsed = UtilityParser.cp(fixture.request());
        expect(parsed.sdPathFrom.subproject).to.equal('source');
        expect(parsed.sdPathTo.subproject).to.equal('destination');
    });

    it('rejects different tenants before reading metadata', async () => {
        const req = fixture.request();
        req.query.sdpath_to = 'sd://other/destination/copied';
        expect((await fixture.invoke(req)).statusCode).to.equal(400);
        sinon.assert.notCalled(fixture.getTenant);
        sinon.assert.notCalled(fixture.enqueue);
    });

    it('uses independent source read and destination write groups', async () => {
        expect((await fixture.invoke(fixture.request())).statusCode).to.equal(202);
        expect(read.firstCall.args[1]).to.have.members([
            ...fixture.source.acls.viewers, ...fixture.source.acls.admins, 'users.data.root@partition.example'
        ]);
        expect(write.firstCall.args[1]).to.have.members([
            ...fixture.destination.acls.admins, 'users.data.root@partition.example'
        ]);
        expect(read.firstCall.args[3]).to.equal('source');
        expect(write.firstCall.args[3]).to.equal('destination');
        sinon.assert.calledTwice(fixture.getSubproject);
        sinon.assert.calledOnce(fixture.enqueue);
        expect(fixture.enqueue.firstCall.args[0].subproject).to.equal(fixture.destination);
        expect(fixture.register.firstCall.args[1].data.subproject).to.equal('destination');
    });

    it('reuses the subproject for same-subproject copies', async () => {
        expect((await fixture.invoke(fixture.request('source'))).statusCode).to.equal(202);
        sinon.assert.calledOnce(fixture.getSubproject);
        expect(read.firstCall.args[3]).to.equal('source');
        expect(write.firstCall.args[3]).to.equal('source');
    });

    for (const sourcePolicy of ['uniform', 'dataset']) {
        it(`uses the ${sourcePolicy} source policy, not the destination policy`, async () => {
            fixture.source.access_policy = sourcePolicy;
            fixture.destination.access_policy = sourcePolicy === 'uniform' ? 'dataset' : 'uniform';
            expect((await fixture.invoke(fixture.request())).statusCode).to.equal(202);
            const acls = sourcePolicy === 'uniform' ? fixture.source.acls : fixture.dataset.acls;
            expect(read.firstCall.args[1]).to.have.members([
                ...acls.viewers, ...acls.admins, 'users.data.root@partition.example'
            ]);
        });
    }

    it('falls back to source subproject ACLs when dataset ACLs are absent', async () => {
        fixture.source.access_policy = 'dataset';
        delete fixture.dataset.acls;
        expect((await fixture.invoke(fixture.request())).statusCode).to.equal(202);
        expect(read.firstCall.args[1]).to.include.members(fixture.source.acls.viewers);
        expect(read.firstCall.args[1]).not.to.include.members(fixture.destination.acls.admins);
    });

    for (const sourceEnforcesKey of [true, false]) {
        it(`uses each subproject's key setting (source enforce_key=${sourceEnforcesKey})`, async () => {
            fixture.source.enforce_key = sourceEnforcesKey;
            fixture.destination.enforce_key = !sourceEnforcesKey;
            expect((await fixture.invoke(fixture.request())).statusCode).to.equal(202);
            const sourceLookup = sourceEnforcesKey ? fixture.getDatasetByKey : fixture.getDataset;
            const destinationLookup = sourceEnforcesKey ? fixture.getDataset : fixture.getDatasetByKey;
            sinon.assert.calledOnce(sourceLookup);
            sinon.assert.calledOnce(destinationLookup);
            expect(sourceLookup.firstCall.args[1].subproject).to.equal('source');
            expect(destinationLookup.firstCall.args[1].subproject).to.equal('destination');
            expect(fixture.journal.createKey.firstCall.args[0].enforcedKey)
                .to.equal(fixture.destination.enforce_key ? '/copied' : undefined);
        });
    }

    for (const operation of ['read', 'write']) {
        for (const rejects of [true, false]) {
            it(`denies copies when ${operation} authorization ${rejects ? 'throws' : 'returns false'}`, async () => {
                const authorization = operation === 'read' ? read : write;
                if (rejects) {
                    authorization.rejects(ServiceError.make(ServiceError.Status.PERMISSION_DENIED, 'Access denied'));
                } else {
                    authorization.resolves(false);
                }
                expect((await fixture.invoke(fixture.request())).statusCode).to.equal(403);
                sinon.assert.notCalled(fixture.storage.getDatasetStorageResource);
                sinon.assert.notCalled(fixture.writeLock);
                sinon.assert.notCalled(fixture.register);
                sinon.assert.notCalled(fixture.enqueue);
            });
        }
    }

    it('returns 404 for a missing source without creating a destination', async () => {
        fixture.getDataset.resolves([undefined, undefined]);
        expect((await fixture.invoke(fixture.request())).statusCode).to.equal(404);
        sinon.assert.notCalled(read);
        sinon.assert.notCalled(fixture.register);
        sinon.assert.notCalled(fixture.enqueue);
    });

    it('propagates a missing source subproject without reading or copying a dataset', async () => {
        fixture.getSubproject.withArgs(fixture.journal, fixture.tenant.name, fixture.source.name)
            .rejects(ServiceError.make(ServiceError.Status.NOT_FOUND, 'Source subproject not found'));
        expect((await fixture.invoke(fixture.request())).statusCode).to.equal(404);
        sinon.assert.notCalled(fixture.getDataset);
        sinon.assert.notCalled(fixture.getDatasetByKey);
        sinon.assert.notCalled(fixture.register);
        sinon.assert.notCalled(fixture.enqueue);
    });
});

// Regression coverage for the reported authorization bypass: POST /utility/cp must
// evaluate source read access against the SOURCE subproject ACLs, not the DESTINATION
// subproject ACLs. This drives the real authorization stack (Auth + DatasetAuth group
// selection) and stubs only entitlement membership, so it fails on the vulnerable code
// (which authorized the source read using the destination ACLs and returned 202).
// It cannot live in the live e2e Postman collection because that collection authenticates
// with a single privileged token that is a member of every group.
describe('Utility copy authorization bypass regression', () => {
    let sandbox: sinon.SinonSandbox;
    let fixture: ReturnType<typeof setupCopyFixture>;
    let membership: sinon.SinonStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        fixture = setupCopyFixture(sandbox);
        // Use the real Auth routing and group computation; stub only the entitlement
        // membership evaluation so we can model exactly which groups the caller belongs to.
        membership = sandbox.stub(AuthGroups, 'isMemberOfAtLeastOneGroup');
    });
    afterEach(() => sandbox.restore());

    function grant(groups: string[]) {
        const granted = new Set(groups);
        membership.callsFake(async (_token: string, groupEmails: string[]) =>
            groupEmails.some((group) => granted.has(group)));
    }

    // A unique token per test avoids the in-memory authorization cache carrying results across tests.
    function requestAs(email: string) {
        const req = fixture.request();
        const payload = Buffer.from(JSON.stringify({ email })).toString('base64');
        req.headers.authorization = `Bearer header.${payload}.signature`;
        return req;
    }

    it('denies a caller who has destination admin but not source read', async () => {
        grant(fixture.destination.acls.admins); // destination admin only, no source access
        const res = await fixture.invoke(requestAs('attacker@example.test'));
        expect(res.statusCode).to.equal(403);
        sinon.assert.notCalled(fixture.storage.getDatasetStorageResource);
        sinon.assert.notCalled(fixture.writeLock);
        sinon.assert.notCalled(fixture.register);
        sinon.assert.notCalled(fixture.enqueue);
    });

    it('denies a dataset-policy source read using destination ACLs', async () => {
        fixture.source.access_policy = 'dataset';
        // Caller holds destination admin and the destination dataset viewers, but not the
        // source dataset viewers. The vulnerable code would authorize via destination ACLs.
        grant([...fixture.destination.acls.admins, ...fixture.destination.acls.viewers]);
        expect((await fixture.invoke(requestAs('attacker@example.test')).then((r) => r.statusCode)))
            .to.equal(403);
        sinon.assert.notCalled(fixture.register);
        sinon.assert.notCalled(fixture.enqueue);
    });

    it('allows the copy once the caller also has source read access', async () => {
        grant([...fixture.destination.acls.admins, ...fixture.source.acls.viewers]);
        const res = await fixture.invoke(requestAs('analyst@example.test'));
        expect(res.statusCode).to.equal(202);
        sinon.assert.calledOnce(fixture.register);
        sinon.assert.calledOnce(fixture.enqueue);
    });
});
