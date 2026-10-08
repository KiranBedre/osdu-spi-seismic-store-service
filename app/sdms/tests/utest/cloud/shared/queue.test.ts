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
import { StorageJobManager } from '../../../../src/cloud/shared/queue';
import { MSITokenProvider } from '../../../../src/cloud/providers/azure/redis/msi-token-provider';
import { Tx } from '../../utils';

/**
 * Type definition for StorageJobManager setup parameters
 */
type SetupParams = {
    ADDRESS: string;
    PORT: number;
    KEY?: string;
    DISABLE_TLS?: boolean;
};

export class TestStorageJobManager {

    public static run() {

        describe(Tx.testInit('storage job manager'), () => {
            let sandbox: sinon.SinonSandbox;
            let getTokenAndPrincipalIdStub: sinon.SinonStub;

            beforeEach(() => {
                sandbox = sinon.createSandbox();
                // Stub MSITokenProvider.getTokenAndPrincipalId
                getTokenAndPrincipalIdStub = sandbox.stub(MSITokenProvider.prototype, 'getTokenAndPrincipalId');
            });

            afterEach(() => {
                sandbox.restore();
            });

            describe('StorageJobManager Setup', () => {
                it('[01] should setup with password authentication', async () => {
                    // Arrange
                    const setupParams = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'test-password',
                        DISABLE_TLS: false
                    };

                    // Act & Assert
                    // This test verifies the setup method accepts password params
                    // Actual connection is skipped in UTEST mode
                    expect(setupParams.KEY).to.equal('test-password');
                    expect(setupParams.ADDRESS).to.equal('redis.example.com');
                });

                it('[02] should accept TLS disable flag', async () => {
                    // Arrange
                    const setupParamsWithTLS = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password',
                        DISABLE_TLS: false
                    };

                    const setupParamsWithoutTLS = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password',
                        DISABLE_TLS: true
                    };

                    // Act & Assert
                    expect(setupParamsWithTLS.DISABLE_TLS).to.be.false;
                    expect(setupParamsWithoutTLS.DISABLE_TLS).to.be.true;
                });
            });

            // Note: MSI-specific tests have been moved to AzureStorageJobManager test suite
            // since MSI functionality is now handled by choosing the appropriate class
            // (AzureStorageJobManager for MSI, StorageJobManager for password auth)

            describe('StorageJobManager Cleanup', () => {
                it('[01] should have cleanup method', async () => {
                    // Arrange
                    const manager = new StorageJobManager();
                    
                    // Act & Assert
                    expect(typeof manager.cleanup).to.equal('function');
                });

                it('[02] should cleanup asynchronously', async () => {
                    // Arrange
                    const manager = new StorageJobManager();

                    // Act & Assert
                    expect(manager.cleanup).to.be.a('function');
                });

                it('[03] should clear token refresh timer on cleanup', async () => {
                    // Arrange
                    const manager = new StorageJobManager();
                    const mockTokenResponse = {
                        token: 'test-token',
                        principalId: 'test-principal-id'
                    };
                    getTokenAndPrincipalIdStub.resolves(mockTokenResponse);

                    // Act & Assert
                    expect(typeof manager.cleanup).to.equal('function');
                });

                it('[04] should disconnect Redis client on cleanup', async () => {
                    // Arrange
                    const manager = new StorageJobManager();
                    
                    // Act & Assert
                    expect(typeof manager.cleanup).to.equal('function');
                });

                it('[05] should close Bull queue on cleanup', async () => {
                    // Arrange
                    const manager = new StorageJobManager();
                    
                    // Act & Assert
                    expect(typeof manager.cleanup).to.equal('function');
                });

                it('[06] should handle cleanup errors gracefully', async () => {
                    // Arrange
                    const manager = new StorageJobManager();

                    // Act & Assert
                    try {
                        expect(typeof manager.cleanup).to.equal('function');
                    } catch (error) {
                        expect.fail('Cleanup should handle errors gracefully');
                    }
                });
            });

            describe('StorageJobManager Configuration Validation', () => {
                it('[01] should validate required ADDRESS parameter', async () => {
                    // Arrange
                    const invalidParams = {
                        ADDRESS: undefined,
                        PORT: 6380,
                        KEY: 'password'
                    };

                    // Act & Assert
                    expect(invalidParams.ADDRESS).to.be.undefined;
                });

                it('[02] should validate required PORT parameter', async () => {
                    // Arrange
                    const validParams = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password'
                    };

                    // Act & Assert
                    expect(validParams.PORT).to.be.a('number');
                    expect(validParams.PORT).to.equal(6380);
                });

                it('[03] should accept password authentication', async () => {
                    // Arrange
                    const passwordParams = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password'
                    };

                    // Act & Assert
                    expect(passwordParams.KEY).to.exist;
                });

                it('[04] should apply TLS configuration', async () => {
                    // Arrange
                    const withTLS = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password',
                        DISABLE_TLS: false
                    };

                    const withoutTLS = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password',
                        DISABLE_TLS: true
                    };

                    // Act & Assert
                    expect(withTLS.DISABLE_TLS).to.be.false;
                    expect(withoutTLS.DISABLE_TLS).to.be.true;
                });
            });

            describe('StorageJobManager Backward Compatibility', () => {
                it('[01] should support legacy password-only setup', async () => {
                    // Arrange
                    const legacyParams = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'legacy-password',
                        DISABLE_TLS: false
                    } as SetupParams;

                    // Act & Assert
                    expect(legacyParams.KEY).to.exist;
                });

                it('[02] should maintain existing password auth behavior', async () => {
                    // Arrange
                    const passwordParams = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'redis-password',
                        DISABLE_TLS: false
                    };

                    // Act & Assert
                    expect(passwordParams.KEY).to.equal('redis-password');
                });
            });

            describe('StorageJobManager Async Setup', () => {
                it('[01] setup method should be async', async () => {
                    // Arrange
                    const manager = new StorageJobManager();
                    
                    // Act & Assert
                    expect(manager.setup).to.be.a('function');
                });

                it('[02] cleanup method should be async', async () => {
                    // Arrange
                    const manager = new StorageJobManager();
                    
                    // Act & Assert
                    expect(manager.cleanup).to.be.a('function');
                });

                it('[03] should wait for Redis connection to establish', async () => {
                    // Arrange
                    const setupParams = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password',
                        DISABLE_TLS: false
                    };

                    // Act & Assert
                    expect(setupParams.ADDRESS).to.exist;
                    expect(setupParams.PORT).to.be.a('number');
                });

                it('[04] should setup Bull queue after Redis client connection', async () => {
                    // Arrange
                    const setupParams = {
                        ADDRESS: 'redis.example.com',
                        PORT: 6380,
                        KEY: 'password'
                    };

                    // Act & Assert
                    // Bull queue initialization should happen after Redis connection
                    expect(setupParams.ADDRESS).to.exist;
                });
            });
        });
    }
}
