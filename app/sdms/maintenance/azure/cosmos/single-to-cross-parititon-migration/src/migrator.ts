import * as fs from 'fs';
import * as crypto from 'crypto'
import { CosmosClient, OperationInput, JSONObject } from '@azure/cosmos';

class Migration {

    public static usageHelp =
        'Usage: ts-node single-to-cross-partition.ts --cosmos-endpoint=... --cosmos-key=... --partition=... (--status)'

    private static getArg(args: any, key: string): any {
        if (!(key in args)) {
            throw Error(
                'The \"' + key + '\" input arg is required but it has not been specified.\n' + Migration.usageHelp);
        }
        return args[key];
    }

    private static async checkStatus(cosmosClient: CosmosClient, partition: string) {

        // single db
        let database = cosmosClient.database('seistore-' + partition + '-db');
        let container = database.container('seistore-' + partition + '-container');
        let singleExist = true;
        try {
            await database.read();
            await container.read();
        } catch (error: any) {
            singleExist = false;
        }

        // check if cross partition db exist
        database = cosmosClient.database('sdms-db');
        container = database.container('data');
        let crossExist = true;
        let crossKey = false;
        try {
            await database.read();
            await container.read();
            if ((await container.item('z:mig:db:complete', 'z:mig:db:complete').read()).resource) {
                crossKey = true;
            }
        } catch (error: any) {
            crossExist = false;
        }



        // cases:
        // single no - cross no -> sdms not initialized in the partition
        // single no - cross yes -> newly created partition - no migration required
        // single yes - cross no -> migration required
        // single yes - cross yes - key yes -> migration completed
        // single yes - cross yes - key no --> migration in progress

        if (!singleExist && !crossExist) {
            console.log('\nSDMS has not been initialized in the ' + partition + ' partition');
            return;
        }

        if (!singleExist && crossExist) {
            // eslint-disable-next-line @stylistic/max-len
            console.log('\nSDMS has already been initialized with the cross partitions model in ' + partition + '. Migration is not required.');
            return;
        }

        if (singleExist && !crossExist) {
            // eslint-disable-next-line @stylistic/max-len
            console.log('\nSDMS has been initialized with the single partition model in ' + partition + '. Migration is required.');
            return;
        }

        if (singleExist && crossExist) {
            if (crossKey) {
                // eslint-disable-next-line @stylistic/max-len
                console.log('\nSDMS has already been migrated to the cross partition model in ' + partition + '. Migration is not required.');
            } else {
                // eslint-disable-next-line @stylistic/max-len
                console.log('\nSDMS migration is in progress in ' + partition + '. Migration is required to be completed.');
            }
        }

    }

    public static async run() {

        const start = performance.now();

        const args = require('minimist')(process.argv.slice(2));
        const cosmosEndpoint = this.getArg(args, 'cosmos-endpoint');
        const cosmosKey = this.getArg(args, 'cosmos-key');
        const partition = this.getArg(args, 'partition');

        const cosmosClient = new CosmosClient({
            endpoint: cosmosEndpoint,
            key: cosmosKey
        });

        if (args['status']) {
            await this.checkStatus(cosmosClient, partition);
            return;
        }

        const databaseNameOld = 'seistore-' + partition + '-db';
        const containerNameOld = 'seistore-' + partition + '-container';
        const databaseOld = cosmosClient.database(databaseNameOld);
        const containerOld = databaseOld.container(containerNameOld)

        // check for database V1 existence - fail if not exist
        process.stdout.write('\n- checking source database ' + databaseNameOld + ' existence: ');
        try {
            await databaseOld.read();
        } catch (error: any) {
            throw Error(
                'The source database \"' + databaseNameOld +
                '\" does not exist in the \"' + partition + '\" partition.');
        }
        process.stdout.write('OK\n');

        // check for container V1 existence - fail if not exist
        process.stdout.write('- checking source container ' + containerNameOld + ' existence: ');
        try {
            await containerOld.read();
        } catch (error: any) {
            throw Error(
                'The source container \"' + containerNameOld + '\" does not exist in the database \"'
                + databaseNameOld + '\" in the  \"' + partition + '\" partition.');
        }
        process.stdout.write('OK\n');

        const databaseName = 'sdms-db';
        const containerName = 'data';

        // check for database V2 existence - create the database if not exist
        process.stdout.write('- creating new database ' + databaseName + ' if not exist: ');
        const { database } = await cosmosClient.databases.createIfNotExists({ id: databaseName });
        process.stdout.write('OK\n');

        // check for container V2 existence - create the container if not exist
        process.stdout.write('- creating new container ' + containerName + ' if not exist: ');
        const { container } = await database.containers.createIfNotExists({
            id: containerName,
            maxThroughput: 40000,
            partitionKey: { paths: ['/id'], version: 2 }
        });
        process.stdout.write('OK\n');

        // wait a minute so the new DB can be detected by the system
        process.stdout.write('\n- waiting the service to detect the change \n');
        await new Promise((resolve) => setTimeout(resolve, 70 * 1000));

        // check if a previous execution exist
        let paginationStart: string;
        let count = 0;
        if (fs.existsSync('.continuation')) {
            console.log('\n- a previous execution has been found, the tool will automatically resume.')
            const data = fs.readFileSync('.continuation', { encoding: 'utf8', flag: 'r' });
            const lines = data.split(/\r?\n/);
            paginationStart = lines[0];
            count = +lines[1];
        }

        const paginationLimit = 100;
        const query = 'SELECT * FROM c';
        const recordsNumber = +Object.values((await containerOld.items.query(
            'SELECT COUNT(1) from c').fetchAll()).resources[0])[0];

        console.log('');

        do {

            const response = await containerOld.items.query(query, {
                continuationToken: paginationStart,
                maxItemCount: paginationLimit
            }).fetchNext();

            const records: OperationInput[] = []
            for (const resource of response.resources) {
                let enforceKey = false;
                const key = resource.key as string;
                if (key.startsWith('seismic-store-') || key.startsWith('organization-')) {
                    const item = {} as { id: string, data: object }
                    if (key.endsWith('-tenants')) {
                        item.id = 'tn-' + resource.id;
                    } else if (key.endsWith('-subprojects')) {
                        item.id = 'sp-' + resource.id;
                        enforceKey = true;
                    } else if (key.endsWith('-apps')) {
                        item.id = 'ap-' + resource.id;
                    } else if (key.endsWith('-datasets')) {
                        item.id = 'ds-' + resource.data.tenant + '-' + resource.data.subproject + '-' +
                            crypto.createHash('sha512').update(resource.data.path + resource.data.name).digest('hex');
                    } else {
                        console.log('------------------- NO SDMS RECORD -------------------');
                        console.log(resource);
                        console.log('------------------------------------------------------');
                    }
                    if (item.id) {
                        item.data = resource.data;
                        item.data['Symbol(id)'].partitionKey = item.id;
                        item.data['Symbol(id)'].name = resource.data.name ?? resource.id;
                        delete item.data['Symbol(id)'].kind;
                        if (enforceKey) {
                            item.data['enforce_key'] = true;
                        }
                        records.push(
                            {
                                operationType: 'Upsert',
                                resourceBody: item as JSONObject
                            }
                        );
                    }
                } else {
                    console.log('------------------- NO SDMS RECORD -------------------');
                    console.log(resource);
                    console.log('------------------------------------------------------');
                }
            }

            if (records.length) {
                await container.items.bulk(records);
            }

            count = count + response.resources.length;
            console.log(
                '- ' + partition + ' - ' + ((100.0 / recordsNumber) * count).toFixed(2) +
                '% of records migrated (' + count + ' of ' + recordsNumber + ')');

            paginationStart = response.continuation
            if (paginationStart) {
                fs.writeFileSync('.continuation', paginationStart + '\n' + count);
            } else if (fs.existsSync('.continuation')) {
                fs.rmSync('.continuation');
            }

        } while (paginationStart);

        // clear the cache
        process.stdout.write('\n- insert clear the cache special key\n');
        await container.items.upsert({ id: 'z:cache::clear' });

        // wait a minute so the system can detect the existence of the new key
        process.stdout.write('- waiting the service to detect the change \n');
        await new Promise((resolve) => setTimeout(resolve, 70 * 1000));

        // remove the cache clear
        process.stdout.write('- remove clear the cache special key\n');
        await container.item('z:cache::clear', 'z:cache::clear').delete();

        // place the special key so the service can re-start (503)
        process.stdout.write('- insert migration complete special key\n');
        await container.items.upsert({ id: 'z:mig:db:complete' });

        // wait a minute so the system can detect the existence of the new key
        process.stdout.write('\n- waiting the service to detect the change \n');
        await new Promise((resolve) => setTimeout(resolve, 70 * 1000));

        const stop = performance.now();
        const inSeconds = (stop - start) / 1000;
        const rounded = Number(inSeconds).toFixed(3);
        process.stdout.write('\n- migration process completed in ' + rounded + 's\n\n');

    }

}


Migration.run().catch((error) => { console.log('\n' + error); });