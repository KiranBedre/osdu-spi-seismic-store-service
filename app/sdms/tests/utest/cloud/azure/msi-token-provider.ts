// ============================================================================
// Copyright 2017-2026, Microsoft Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

import { expect } from 'chai';
import sinon from 'sinon';
import { DefaultAzureCredential } from '@azure/identity';
import { MSITokenProvider } from '../../../../src/cloud/providers/azure/redis/msi-token-provider';
import { Tx } from '../../utils';

const REDIS_SCOPE = 'https://redis.azure.com/.default';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

/**
 * Helper function to create a mock JWT token with the specified principal ID
 * @param principalId - The principal ID (oid claim) to include in the token
 * @returns A valid base64url-encoded JWT token string
 */
function createMockJwt(principalId: string): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = { oid: principalId };
    return [
        Buffer.from(JSON.stringify(header)).toString('base64url'),
        Buffer.from(JSON.stringify(payload)).toString('base64url'),
        'signature'
    ].join('.');
}

export class TestMSITokenProvider {

    public static run() {
        describe(Tx.testInit('MSI Token Provider'), () => {
            let sandbox: sinon.SinonSandbox;
            let tokenProvider: MSITokenProvider;
            let getTokenStub: sinon.SinonStub;

            beforeEach(() => {
                sandbox = sinon.createSandbox();
                tokenProvider = new MSITokenProvider();
                
                // Stub the DefaultAzureCredential.getToken method
                getTokenStub = sandbox.stub(DefaultAzureCredential.prototype, 'getToken');
            });

            afterEach(() => {
                sandbox.restore();
            });

            describe('getTokenAndPrincipalId', () => {
                it('should acquire a new token and principal ID on first call', async () => {
                    const mockJwt = createMockJwt('test-principal-id-123');
                    const mockToken = {
                        token: mockJwt,
                        expiresOnTimestamp: Date.now() + ONE_HOUR_MS
                    };
                    getTokenStub.resolves(mockToken);

                    const result = await tokenProvider.getTokenAndPrincipalId();

                    expect(result).to.have.property('token', mockJwt);
                    expect(result).to.have.property('principalId', 'test-principal-id-123');
                    expect(getTokenStub.calledOnce).to.be.true;
                    expect(getTokenStub.calledWith(REDIS_SCOPE)).to.be.true;
                });

                it('should return cached token and principal ID if still valid', async () => {
                    const mockJwt = createMockJwt('cached-principal-id');
                    const mockToken = {
                        token: mockJwt,
                        expiresOnTimestamp: Date.now() + ONE_HOUR_MS
                    };
                    getTokenStub.resolves(mockToken);

                    // First call
                    const result1 = await tokenProvider.getTokenAndPrincipalId();
                    
                    // Second call should return cached values without calling getToken again
                    const result2 = await tokenProvider.getTokenAndPrincipalId();

                    expect(result1.token).to.equal(mockJwt);
                    expect(result2.token).to.equal(mockJwt);
                    expect(result1.principalId).to.equal('cached-principal-id');
                    expect(result2.principalId).to.equal('cached-principal-id');
                    expect(result1.principalId).to.equal(result2.principalId);
                    expect(getTokenStub.calledOnce).to.be.true; // Only called once
                });

                it('should acquire new token when cached token is about to expire', async () => {
                    const expiredJwt = createMockJwt('expired-principal-id');
                    const refreshedJwt = createMockJwt('refreshed-principal-id');
                    
                    const expiredToken = {
                        token: expiredJwt,
                        expiresOnTimestamp: Date.now() + ONE_MINUTE_MS // Only 1 minute left (within 5-minute buffer)
                    };
                    const newToken = {
                        token: refreshedJwt,
                        expiresOnTimestamp: Date.now() + ONE_HOUR_MS
                    };
                    
                    getTokenStub.onFirstCall().resolves(expiredToken);
                    getTokenStub.onSecondCall().resolves(newToken);

                    // First call gets the "expired" token
                    const result1 = await tokenProvider.getTokenAndPrincipalId();
                    
                    // Second call should refresh since token is within buffer zone
                    const result2 = await tokenProvider.getTokenAndPrincipalId();

                    expect(result1.token).to.equal(expiredJwt);
                    expect(result2.token).to.equal(refreshedJwt);
                    expect(result1.principalId).to.equal('expired-principal-id');
                    expect(result2.principalId).to.equal('refreshed-principal-id');
                    expect(getTokenStub.calledTwice).to.be.true;
                });
            });

            describe('refreshToken', () => {
                it('should acquire and cache a new token with principal ID', async () => {
                    const mockJwt = createMockJwt('fresh-principal-id');
                    const mockToken = {
                        token: mockJwt,
                        expiresOnTimestamp: Date.now() + ONE_HOUR_MS
                    };
                    getTokenStub.resolves(mockToken);

                    const result = await tokenProvider.refreshToken();

                    expect(result).to.have.property('token', mockJwt);
                    expect(result).to.have.property('principalId', 'fresh-principal-id');
                    expect(getTokenStub.calledOnce).to.be.true;
                });

                it('should throw error on token acquisition failure', async () => {
                    const mockError = new Error('Authentication failed');
                    getTokenStub.rejects(mockError);

                    try {
                        await tokenProvider.refreshToken();
                        expect.fail('Should have thrown an error');
                    } catch (error) {
                        expect((error as Error).message).to.equal('Authentication failed');
                    }
                });
            });
        });
    }
}
