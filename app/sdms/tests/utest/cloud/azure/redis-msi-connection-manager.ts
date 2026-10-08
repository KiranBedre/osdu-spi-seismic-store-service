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
import Redis, { Cluster } from 'ioredis';
import sinon from 'sinon';

import { MSITokenProvider } from '../../../../src/cloud/providers/azure/redis/msi-token-provider';
import { RedisClientType } from '../../../../src/cloud/providers/azure/redis/redis-client-type';
import { RedisMsiConnectionManager } from '../../../../src/cloud/providers/azure/redis/redis-msi-connection-manager';
import { Tx } from '../../utils';

export class TestRedisMsiConnectionManager {

    public static run() {
        describe(Tx.testInit('Redis MSI Connection Manager'), () => {
            let sandbox: sinon.SinonSandbox;
            let manager: RedisMsiConnectionManager;
            let getTokenStub: sinon.SinonStub;
            let refreshTokenStub: sinon.SinonStub;

            beforeEach(() => {
                sandbox = sinon.createSandbox();
                RedisMsiConnectionManager.resetInstance();
                manager = RedisMsiConnectionManager.getInstance();

                // Stub MSITokenProvider methods
                getTokenStub = sandbox.stub(MSITokenProvider.prototype, 'getTokenAndPrincipalId')
                    .resolves({ token: 'mock-token-123', principalId: 'mock-principal-id-456' });
                refreshTokenStub = sandbox.stub(MSITokenProvider.prototype, 'refreshToken')
                    .resolves({ token: 'refreshed-token-789', principalId: 'refreshed-principal-abc' });
            });

            afterEach(async () => {
                // Clean up manager timers before restoring sandbox
                await manager.cleanup();
                sandbox.restore();
            });

            describe('Singleton pattern', () => {
                it('should return the same instance on multiple calls to getInstance()', () => {
                    const instance1 = RedisMsiConnectionManager.getInstance();
                    const instance2 = RedisMsiConnectionManager.getInstance();

                    expect(instance1).to.equal(instance2);
                });

                it('should create a new instance after resetInstance()', () => {
                    const instance1 = RedisMsiConnectionManager.getInstance();
                    RedisMsiConnectionManager.resetInstance();
                    const instance2 = RedisMsiConnectionManager.getInstance();

                    expect(instance1).to.not.equal(instance2);
                });
            });

            describe('createMsiRedisOptions', () => {
                it('should create Redis options with MSI token and principal ID', async () => {
                    const options = await manager.createMsiRedisOptions(
                        'test-redis.redis.cache.windows.net',
                        6380,
                        false,
                        'test-connection'
                    );

                    expect(options).to.have.property('host', 'test-redis.redis.cache.windows.net');
                    expect(options).to.have.property('port', 6380);
                    expect(options).to.have.property('connectionName', 'test-connection');
                    expect(options).to.have.property('username', 'mock-principal-id-456');
                    expect(options).to.have.property('password', 'mock-token-123');
                    expect(options).to.have.property('tls');
                    expect(options.tls).to.deep.equal({ servername: 'test-redis.redis.cache.windows.net' });
                });

                it('should merge base options', async () => {
                    const baseOptions = {
                        connectTimeout: 15000,
                        commandTimeout: 8000
                    };

                    const options = await manager.createMsiRedisOptions(
                        'test-redis.redis.cache.windows.net',
                        6380,
                        false,
                        'test-connection',
                        baseOptions
                    );

                    expect(options).to.have.property('connectTimeout', 15000);
                    expect(options).to.have.property('commandTimeout', 8000);
                });
            });

            describe('waitForClientReady', () => {
                // Helper to create mock client with configurable event behavior
                const createMockClientWithEvents = (
                    status: string,
                    eventBehavior?: 'ready' | 'error' | 'timeout'
                ) => {
                    const mockClient = {
                        status,
                        once: sandbox.stub(),
                        removeListener: sandbox.stub()
                    } as any;

                    if (eventBehavior === 'ready') {
                        mockClient.once.callsFake((event: string, handler: any) => {
                            if (event === 'ready') {
                                setTimeout(() => handler(), 10);
                            }
                        });
                    } else if (eventBehavior === 'error') {
                        mockClient.once.callsFake((event: string, handler: any) => {
                            if (event === 'error') {
                                setTimeout(() => handler(new Error('Connection failed')), 10);
                            }
                        });
                    }

                    return mockClient;
                };

                it('should resolve immediately if client is already ready', async () => {
                    const mockClient = createMockClientWithEvents('ready');

                    await manager.waitForClientReady(mockClient, 'test-label', 'TestComponent', RedisClientType.Redis, true);

                    expect(mockClient.removeListener.called).to.be.false;
                });

                it('should wait for ready event on connecting client', async () => {
                    const mockClient = createMockClientWithEvents('connecting', 'ready');

                    await manager.waitForClientReady(mockClient, 'test-label', 'TestComponent', RedisClientType.Redis, true);

                    expect(mockClient.once.calledWith('ready')).to.be.true;
                    expect(mockClient.once.calledWith('error')).to.be.true;
                });

                it('should reject on error event', async () => {
                    const mockClient = createMockClientWithEvents('connecting', 'error');

                    try {
                        await manager.waitForClientReady(mockClient, 'test-label', 'TestComponent', RedisClientType.Redis, true);
                        expect.fail('Should have thrown an error');
                    } catch (error) {
                        expect((error as Error).message).to.include('connection/auth error');
                    }
                });

                it('should timeout if client does not become ready within timeout period', async () => {
                    const clock = sandbox.useFakeTimers();
                    const mockClient = createMockClientWithEvents('connecting', 'timeout');

                    const waitPromise = manager.waitForClientReady(mockClient, 'test-label', 'TestComponent', RedisClientType.Redis, true);
                    
                    clock.tick(30001); // Exceed CONNECTION_TIMEOUT_MS (30000)

                    try {
                        await waitPromise;
                        expect.fail('Should have thrown a timeout error');
                    } catch (error) {
                        expect((error as Error).message).to.include('authentication timeout');
                    }
                });
            });

            describe('authenticateRedisClient', () => {
                // Helper to create mock Redis client
                const createMockRedis = (status: string, authBehavior?: 'success' | 'error') => {
                    const authStub = authBehavior === 'error'
                        ? sandbox.stub().rejects(new Error('AUTH command failed'))
                        : sandbox.stub().resolves();
                    
                    return {
                        status,
                        auth: authStub,
                        options: {
                            username: 'old-username',
                            password: 'old-password'
                        }
                    } as any;
                };

                // Data-driven tests for auth conditions
                const authTestCases = [
                    {
                        description: 'should update options and call auth() when client is ready',
                        status: 'ready',
                        isPeriodicAuthEnabled: true,
                        expectAuthCalled: true,
                        authBehavior: 'success' as const
                    },
                    {
                        description: 'should update options but skip auth() when client is not ready',
                        status: 'connecting',
                        isPeriodicAuthEnabled: true,
                        expectAuthCalled: false,
                        authBehavior: 'success' as const
                    },
                    {
                        description: 'should update options but skip auth() when isPeriodicAuthEnabled is false',
                        status: 'ready',
                        isPeriodicAuthEnabled: false,
                        expectAuthCalled: false,
                        authBehavior: 'success' as const
                    }
                ];

                authTestCases.forEach(({ description, status, isPeriodicAuthEnabled, expectAuthCalled, authBehavior }) => {
                    it(description, async () => {
                        const mockRedis = createMockRedis(status, authBehavior);

                        await (manager as any).authenticateRedisClient(mockRedis, 'test-redis', isPeriodicAuthEnabled);

                        // All cases should update options
                        expect(mockRedis.options.username).to.equal('mock-principal-id-456');
                        expect(mockRedis.options.password).to.equal('mock-token-123');

                        // auth() call depends on conditions
                        if (expectAuthCalled) {
                            expect(mockRedis.auth.calledOnce).to.be.true;
                            expect(mockRedis.auth.calledWith('mock-principal-id-456', 'mock-token-123')).to.be.true;
                        } else {
                            expect(mockRedis.auth.called).to.be.false;
                        }
                    });
                });

                it('should handle auth() errors gracefully', async () => {
                    const mockRedis = createMockRedis('ready', 'error');

                    // Should not throw - errors are logged
                    await (manager as any).authenticateRedisClient(mockRedis, 'test-redis', true);

                    expect(mockRedis.options.username).to.equal('mock-principal-id-456');
                    expect(mockRedis.options.password).to.equal('mock-token-123');
                });
            });

            describe('authenticateClusterClient', () => {
                it('should update options.redisOptions only (no auth() call)', async () => {
                    const mockCluster = {
                        status: 'ready',
                        options: {
                            redisOptions: {
                                username: 'old-username',
                                password: 'old-password'
                            }
                        },
                        auth: sandbox.stub() // Should never be called
                    } as any;

                    await (manager as any).authenticateClusterClient(mockCluster, 'test-cluster', true);

                    expect(mockCluster.options.redisOptions.username).to.equal('mock-principal-id-456');
                    expect(mockCluster.options.redisOptions.password).to.equal('mock-token-123');
                    expect(mockCluster.auth.called).to.be.false;
                });

                it('should handle missing redisOptions gracefully', async () => {
                    const mockCluster = {
                        status: 'ready',
                        options: {}
                    } as any;

                    // Should not throw
                    await (manager as any).authenticateClusterClient(mockCluster, 'test-cluster', true);
                });

                it('should update options when isPeriodicAuthEnabled is false', async () => {
                    const mockCluster = {
                        status: 'ready',
                        options: {
                            redisOptions: {
                                username: 'old-username',
                                password: 'old-password'
                            }
                        }
                    } as any;

                    await (manager as any).authenticateClusterClient(mockCluster, 'test-cluster', false);

                    // Credentials still updated (just no log about skipping AUTH)
                    expect(mockCluster.options.redisOptions.username).to.equal('mock-principal-id-456');
                    expect(mockCluster.options.redisOptions.password).to.equal('mock-token-123');
                });
            });

            describe('Token refresh', () => {
                // Helper to create simple mock client
                const createSimpleMockClient = () => ({ status: 'ready', options: {} } as any);

                it('should start refresh timer when first client is registered', () => {
                    const clock = sandbox.useFakeTimers();
                    const mockRedis = createSimpleMockClient();

                    (manager as any).registerClient(mockRedis, 'first-client', true);

                    // Verify interval was created (timer should be set)
                    expect((manager as any).refreshTimer).to.not.be.null;
                });

                it('should not start multiple refresh timers on subsequent registrations', () => {
                    const clock = sandbox.useFakeTimers();
                    const mockRedis1 = createSimpleMockClient();
                    const mockRedis2 = createSimpleMockClient();

                    (manager as any).registerClient(mockRedis1, 'client-1', true);
                    const firstTimerId = (manager as any).refreshTimer;
                    
                    (manager as any).registerClient(mockRedis2, 'client-2', true);
                    const secondTimerId = (manager as any).refreshTimer;

                    expect(firstTimerId).to.equal(secondTimerId);
                });

                it('should refresh all registered clients on timer tick', async () => {
                    const clock = sandbox.useFakeTimers();

                    // Reconfigure the stub to return refreshed values (without detaching it)
                    getTokenStub.resetBehavior();
                    getTokenStub.resolves({ token: 'refreshed-token-789', principalId: 'refreshed-principal-abc' });

                    // Create proper stub instances that pass instanceof checks
                    const mockRedis = sandbox.createStubInstance(Redis);
                    const mockCluster = sandbox.createStubInstance(Cluster);

                    // Configure Redis stub with writable options
                    const redisOptions = { username: 'old-redis-user', password: 'old-redis-pass' };
                    Object.defineProperty(mockRedis, 'options', { value: redisOptions, writable: false, configurable: true });
                    Object.defineProperty(mockRedis, 'status', { value: 'ready', writable: true, configurable: true });
                    mockRedis.auth.resolves();

                    // Configure Cluster stub with writable options.redisOptions
                    const clusterRedisOptions = { username: 'old-cluster-user', password: 'old-cluster-pass' };
                    Object.defineProperty(mockCluster, 'options', { 
                        value: { redisOptions: clusterRedisOptions }, 
                        writable: false, 
                        configurable: true 
                    });
                    Object.defineProperty(mockCluster, 'status', { value: 'ready', writable: true, configurable: true });

                    (manager as any).registerClient(mockRedis, 'redis-client', true);
                    (manager as any).registerClient(mockCluster, 'cluster-client', true);

                    // Advance time to trigger refresh
                    await clock.tickAsync(45 * 60 * 1000 + 100);

                    expect(refreshTokenStub.called).to.be.true;
                    expect(getTokenStub.called).to.be.true;
                    // Check the same reference objects were mutated
                    expect(redisOptions.username).to.equal('refreshed-principal-abc');
                    expect(redisOptions.password).to.equal('refreshed-token-789');
                    expect(clusterRedisOptions.username).to.equal('refreshed-principal-abc');
                    expect(clusterRedisOptions.password).to.equal('refreshed-token-789');
                });
            });

            describe('Client registration', () => {
                // Helper to create simple mock client
                const createSimpleMockClient = () => ({ status: 'ready', options: {} } as any);

                it('should register client only once (idempotent)', () => {
                    const mockRedis = createSimpleMockClient();

                    (manager as any).registerClient(mockRedis, 'test-client', true);
                    (manager as any).registerClient(mockRedis, 'test-client', true);

                    const registeredClients = (manager as any).registeredClients;
                    expect(registeredClients).to.have.lengthOf(1);
                });

                it('should register multiple different clients', () => {
                    const mockRedis1 = createSimpleMockClient();
                    const mockRedis2 = createSimpleMockClient();

                    (manager as any).registerClient(mockRedis1, 'client-1', true);
                    (manager as any).registerClient(mockRedis2, 'client-2', true);

                    const registeredClients = (manager as any).registeredClients;
                    expect(registeredClients).to.have.lengthOf(2);
                });

                it('should store isPeriodicAuthEnabled flag with client', () => {
                    const mockRedis = createSimpleMockClient();

                    (manager as any).registerClient(mockRedis, 'test-client', false);

                    const registeredClients = (manager as any).registeredClients;
                    expect(registeredClients[0].isPeriodicAuthEnabled).to.be.false;
                });
            });

            describe('cleanup', () => {
                // Helper to create simple mock client
                const createSimpleMockClient = () => ({ status: 'ready', options: {} } as any);

                it('should clear refresh timer', async () => {
                    const mockRedis = createSimpleMockClient();

                    (manager as any).registerClient(mockRedis, 'test-client', true);
                    const timerId = (manager as any).refreshTimer;
                    expect(timerId).to.not.be.null;

                    await manager.cleanup();

                    expect((manager as any).refreshTimer).to.be.null;
                });

                it('should clear registered clients array', async () => {
                    const mockRedis = createSimpleMockClient();

                    (manager as any).registerClient(mockRedis, 'test-client', true);
                    await manager.cleanup();

                    const registeredClients = (manager as any).registeredClients;
                    expect(registeredClients).to.be.empty;
                });
            });

            describe('Event handlers', () => {
                it('should setup error handler on client', async () => {
                    // Create a mock client with an 'on' method
                    const mockClient = {
                        status: 'connecting',
                        on: sandbox.stub().returnsThis(),
                        once: sandbox.stub(),
                        removeListener: sandbox.stub()
                    } as any;
                    
                    // Call setupClientEventHandlers directly to test event registration
                    (manager as any).setupClientEventHandlers(mockClient, 'test-client', 'TestComponent');

                    // Verify event handlers were registered
                    expect(mockClient.on.calledWith('error')).to.be.true;
                    expect(mockClient.on.calledWith('commandTimeout')).to.be.true;
                    expect(mockClient.on.calledWith('close')).to.be.true;
                    expect(mockClient.on.calledWith('reconnecting')).to.be.true;
                    expect(mockClient.on.calledWith('ready')).to.be.true;
                });
            });

            describe('Type guard', () => {
                it('should identify Redis instance correctly', () => {
                    const mockRedis = sandbox.createStubInstance(Redis);
                    const result = (manager as any).isRedisClient(mockRedis);
                    expect(result).to.be.true;
                });

                it('should identify Cluster instance correctly', () => {
                    const mockCluster = sandbox.createStubInstance(Cluster);
                    const result = (manager as any).isRedisClient(mockCluster);
                    expect(result).to.be.false;
                });
            });
        });
    }
}
