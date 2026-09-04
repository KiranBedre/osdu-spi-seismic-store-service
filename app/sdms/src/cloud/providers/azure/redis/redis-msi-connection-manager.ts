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

import Redis, { Cluster, type RedisOptions, type ClusterOptions } from 'ioredis';

import { Config, LoggerFactory } from '../../..';
import { Utils } from '../../../../shared';

import { MSITokenProvider } from './msi-token-provider';
import type { RedisWithOptions } from './redis-with-options';
import type { ClusterWithOptions } from './cluster-with-options';
import { RedisClientType } from './redis-client-type';

/**
 * Redis MSI connection manager supporting both standalone and cluster modes
 * Manages connections with MSI authentication, including token refresh and cleanup
 *
 * Architecture:
 * - Standalone Redis: Azure Cache for Redis (port 6380) - legacy mode
 * - Cluster: Azure Managed Redis (port 10000) - new AMR mode
 *
 * Maintains separate tracking for each client type to distinguish legacy vs new infrastructure
 */
export class RedisMsiConnectionManager {
    private static readonly AMR_PORT = 10000;
    private static instance: RedisMsiConnectionManager | null = null;

    private refreshTimer: NodeJS.Timeout | null = null;
    public readonly msiTokenProvider: MSITokenProvider;
    private readonly REFRESH_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes
    private readonly CONNECTION_TIMEOUT_MS = 30000; // 30 seconds

    // Cluster configuration
    private readonly CLUSTER_RETRY_BASE_MS = 100; // Exponential backoff base
    private readonly CLUSTER_RETRY_MAX_MS = 2000; // Max retry delay
    private readonly CLUSTER_SLOTS_REFRESH_TIMEOUT_MS = 10000; // Slot refresh timeout

    private readonly logger: any;

    // Single array for both Redis and Cluster clients (deployment uses only one type)
    private registeredClients: {
        client: Redis | Cluster;
        label: string;
        isPeriodicAuthEnabled: boolean;
    }[] = [];

    private constructor() {
        this.msiTokenProvider = new MSITokenProvider();
        this.logger = Config.CLOUDPROVIDER ? LoggerFactory.build(Config.CLOUDPROVIDER) : console;
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(): RedisMsiConnectionManager {
        if (!RedisMsiConnectionManager.instance) {
            RedisMsiConnectionManager.instance = new RedisMsiConnectionManager();
        }
        return RedisMsiConnectionManager.instance;
    }

    /**
     * Reset the singleton instance (primarily for testing)
     */
    public static resetInstance(): void {
        RedisMsiConnectionManager.instance = null;
    }

    /**
     * Creates Redis options with MSI authentication
     */
    public async createMsiRedisOptions(
        host: string,
        port: number,
        disableTls: boolean,
        connectionName: string,
        baseOptions?: Partial<RedisOptions>
    ): Promise<RedisOptions> {
        const { token, principalId } = await this.msiTokenProvider.getTokenAndPrincipalId();

        const redisOptions: RedisOptions = {
            host,
            port,
            connectionName,
            username: principalId,
            password: token,
            ...baseOptions
        };

        if (!disableTls) {
            redisOptions.tls = { servername: host };
        }

        return redisOptions;
    }

    /**
     * Creates and initializes a Redis client with MSI authentication
     * Auto-detects standalone vs cluster mode based on port
     * @param host - Redis host address
     * @param port - Redis port (10000 = AMR Cluster, others = standalone Redis)
     * @param disableTls - If true, disables TLS/SSL
     * @param connectionName - Client connection name for logging
     * @param component - Component name for logging context
    * @param baseOptions - Additional Redis client options merged into the final configuration
    * @param isPeriodicAuthEnabled - Whether periodic AUTH commands are enabled for this client
     * @returns Promise resolving to Redis client (standalone) or Cluster client (AMR)
     */
    public async initializeRedisClient(
        host: string,
        port: number,
        disableTls: boolean,
        connectionName: string,
        component: string,
        baseOptions: Partial<RedisOptions>,
        isPeriodicAuthEnabled: boolean
    ): Promise<Redis | Cluster> {
        const redisOptions = await this.createMsiRedisOptions(
            host,
            port,
            disableTls,
            connectionName,
            baseOptions
        );

        // Auto-detect based on port: 10000 = AMR Cluster, others = standalone Redis
        const isClusterMode = port === RedisMsiConnectionManager.AMR_PORT;
        const client = isClusterMode
            ? new Cluster([{ host, port }], {
                redisOptions: redisOptions as ClusterOptions['redisOptions'],
                enableReadyCheck: true,
                clusterRetryStrategy: (times: number) => Math.min(
                    times * this.CLUSTER_RETRY_BASE_MS,
                    this.CLUSTER_RETRY_MAX_MS
                ),
                slotsRefreshTimeout: this.CLUSTER_SLOTS_REFRESH_TIMEOUT_MS
            })
            : new Redis(redisOptions);

        const clientType = isClusterMode ? RedisClientType.Cluster : RedisClientType.Redis;
        this.logger.info(`[${component}] Creating ${clientType} client '${connectionName}' (port ${port})`);

        this.setupClientEventHandlers(client, connectionName, component, clientType);

        await this.waitForClientReady(
            client, connectionName, component, clientType, isPeriodicAuthEnabled
        );
        return client;
    }

    /**
     * Waits for a client to be ready with timeout protection
     * Works with both Redis and Cluster clients (they share the same event/status API)
     */
    public async waitForClientReady(
        client: Redis | Cluster,
        label: string,
        component: string,
        clientType: RedisClientType,
        isPeriodicAuthEnabled: boolean
    ): Promise<void> {

        if (client.status === 'ready') {
            this.logger.info(`[${component}] ${clientType} client '${label}' already connected`);
            this.registerClient(client, label, isPeriodicAuthEnabled);
            return;
        }

        let timeoutHandle: NodeJS.Timeout | null = null;

        await new Promise<void>((resolve, reject) => {
            let settled = false;

            const cleanup = () => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                client.removeListener('ready', onReady);
                client.removeListener('error', onError);
            };

            const onReady = () => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    this.logger.info(`[${component}] ${clientType} client '${label}' connected with MSI auth`);
                    resolve();
                }
            };

            const onError = (err: unknown) => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    const { name: errorName, code: errorCode, message: errorMessage } =
                        Utils.extractErrorInfo(err);
                    this.logger.error({
                        message:
                            `[${component}] ${clientType} client '${label}' connection/auth error | ` +
                            `status=${client.status || 'unknown'} | ` +
                            `errorName=${errorName} | errorCode=${errorCode} | errorMessage=${errorMessage}`,
                        context: 'RedisMsiConnectionManager.waitForClientReady'
                    });
                    reject(new Error(
                        `[${component}] ${clientType} client '${label}' connection/auth error | ` +
                        `errorName=${errorName} | errorCode=${errorCode}`
                    ));
                }
            };

            // Set timeout to prevent indefinite hanging
            timeoutHandle = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    const errorMsg =
                        `[${component}] ${clientType} client '${label}' authentication timeout after ` +
                        `${this.CONNECTION_TIMEOUT_MS}ms. ` +
                        `Status: ${client.status || 'unknown'}. Check Redis AAD authentication configuration.`;
                    this.logger.error({
                        message: `${errorMsg} | errorName=RedisAuthenticationTimeout | errorCode=REDIS_AUTH_TIMEOUT`,
                        context: 'RedisMsiConnectionManager.waitForClientReady'
                    });
                    reject(new Error(errorMsg));
                }
            }, this.CONNECTION_TIMEOUT_MS);

            client.once('ready', onReady);
            client.once('error', onError);
        });

        // Register client for token refresh after successful connection
        this.registerClient(client, label, isPeriodicAuthEnabled);
    }

    /**
     * Cleanup method for graceful shutdown
     * Note: Callers are responsible for disconnecting their own Redis clients and closing queues
     */
    public async cleanup(): Promise<void> {
        this.logger.info(`[RedisMsiConnectionManager] Cleaning up Redis MSI connection resources`);

        // Clear refresh timer
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        // Clear registered clients
        this.registeredClients = [];

        this.logger.info(`[RedisMsiConnectionManager] Redis MSI connection cleanup completed`);
    }

    /**
     * Starts periodic token refresh and re-authentication
     * Idempotent - only starts once even if called multiple times
    *
     * Per Azure docs: AUTH must be sent periodically before token expiry
     * Configured for 45-minute interval for sufficient margin while minimizing overhead
     */
    private startRefresh(): void {
        // If timer already exists, don't create another one
        if (this.refreshTimer) {
            this.logger.info(`[RedisMsiConnectionManager] Refresh already started, skipping`);
            return;
        }

        if (this.registeredClients.length === 0) {
            this.logger.info(`[RedisMsiConnectionManager] No Redis clients registered for refresh`);
            return;
        }

        this.logger.info(
            `[RedisMsiConnectionManager] Starting refresh timer ` +
            `(every ${this.REFRESH_INTERVAL_MS / 1000}s) for ${this.registeredClients.length} clients`
        );

        this.refreshTimer = setInterval(async () => {
            try {
                this.logger.info(
                    `[RedisMsiConnectionManager] Refreshing MSI token and re-authenticating ` +
                    `${this.registeredClients.length} clients...`
                );

                // Force token refresh by calling Azure (MSITokenProvider will cache it)
                await this.msiTokenProvider.refreshToken();

                // Re-authenticate all clients
                for (const { client, label, isPeriodicAuthEnabled } of this.registeredClients) {
                    if (this.isRedisClient(client)) {
                        await this.authenticateRedisClient(client, label, isPeriodicAuthEnabled);
                    } else {
                        await this.authenticateClusterClient(client, label, isPeriodicAuthEnabled);
                    }
                }

                this.logger.info(`[RedisMsiConnectionManager] Token refresh and re-authentication cycle completed`);
            } catch (error: unknown) {
                const clientLabels = this.registeredClients.map(({ label }) => label).join(',');
                Utils.logError(this.logger, error,
                    `[RedisMsiConnectionManager] Failed to refresh token and re-authenticate | ` +
                    `operation=refresh | clients=${clientLabels || 'none'}`,
                    'RedisMsiConnectionManager.startRefresh');
            }
        }, this.REFRESH_INTERVAL_MS);
    }

    /**
     * Register a client for token refresh (idempotent - prevents duplicates)
     * Automatically starts token refresh timer when first client is registered
     * NOTE: Does NOT run AUTH here - ioredis handles initial auth via options
     * @param isPeriodicAuthEnabled - If false, periodic AUTH will be skipped (credentials still updated in options)
     */
    private registerClient(client: Redis | Cluster, label: string, isPeriodicAuthEnabled: boolean): void {
        const alreadyRegistered = this.registeredClients.some(
            registered => registered.client === client
        );

        if (!alreadyRegistered) {
            const isFirstClient = this.registeredClients.length === 0;
            const clientType = this.isRedisClient(client)
                ? RedisClientType.Redis
                : RedisClientType.Cluster;

            this.registeredClients.push({ client, label, isPeriodicAuthEnabled });
            const periodicAuthStatus = !isPeriodicAuthEnabled ? '(periodic AUTH disabled)' : '';
            this.logger.info(
                `[RedisMsiConnectionManager] Registered ${clientType} client '${label}' ` +
                `for token refresh ${periodicAuthStatus}`
            );

            // Auto-start refresh timer when first client is registered
            // Check before push to avoid race condition with concurrent registrations
            if (isFirstClient) {
                this.logger.info(`[RedisMsiConnectionManager] First client registered, starting refresh timer`);
                this.startRefresh();
            }
        }
    }

    /**
     * Authenticate a standalone Redis client with current MSI token
     * Called during periodic token refresh to:
     * 1. Update client.options (ioredis reads these on next reconnection)
     * 2. Run AUTH on live connections (to rotate credentials without reconnecting)
    *
     * @param isPeriodicAuthEnabled - If false, skips AUTH command but still updates options
     *   Use for Redis clients in special modes (pub/sub subscribers, blocking BRPOP clients)
     */
    private async authenticateRedisClient(
        client: Redis, label: string, isPeriodicAuthEnabled: boolean
    ): Promise<void> {
        try {
            const { token, principalId } = await this.msiTokenProvider.getTokenAndPrincipalId();

            // Update client options for future reconnections
            // Both username and password must be updated for MSI auth
            const redis = client as RedisWithOptions;
            redis.options.username = principalId;
            redis.options.password = token;

            if (!isPeriodicAuthEnabled) {
                this.logger.info(
                    `[RedisMsiConnectionManager] Skipping AUTH for '${label}' ` +
                    `(periodic auth disabled), token updated in options only`
                );
                return;
            }

            // Only run AUTH command if client is connected and ready
            // If not ready, the updated options will be used on next connection attempt
            if (client.status === 'ready') {
                this.logger.info(
                    `[RedisMsiConnectionManager] Running AUTH on '${label}' (status: ${client.status})`
                );
                await client.auth(principalId, token);
                this.logger.info(`[RedisMsiConnectionManager] AUTH successful on '${label}'`);
            } else {
                this.logger.info(
                    `[RedisMsiConnectionManager] Updated token in options for '${label}' ` +
                    `(status: ${client.status}), AUTH skipped`
                );
            }
        } catch (error: unknown) {
            Utils.logError(this.logger, error,
                `[RedisMsiConnectionManager] Failed to authenticate Redis client '${label}' | ` +
                `status=${client.status || 'unknown'}`,
                'RedisMsiConnectionManager.authenticateRedisClient');
        }
    }

    /**
     * Authenticate a Cluster client with current MSI token
     * Called during periodic token refresh to:
     * 1. Update cluster.options.redisOptions (ioredis reads these on next reconnection)
    *
     * Note: Unlike standalone Redis, Cluster doesn't support AUTH on live connections.
     * Credentials are applied automatically when cluster nodes reconnect.
    *
    * @param isPeriodicAuthEnabled - If false, skips periodic credential updates
    *   (though Cluster doesn't run AUTH anyway)
     *   Use for consistency with Redis client behavior in special modes (pub/sub subscribers, blocking BRPOP clients)
     */
    private async authenticateClusterClient(
        client: Cluster, label: string, isPeriodicAuthEnabled: boolean
    ): Promise<void> {
        try {
            const { token, principalId } = await this.msiTokenProvider.getTokenAndPrincipalId();

            // Update cluster options for future reconnections
            // Both username and password must be updated for MSI auth
            // For Cluster, credentials are stored in options.redisOptions
            // and applied to all nodes.
            const cluster = client as ClusterWithOptions;
            if (cluster.options?.redisOptions) {
                cluster.options.redisOptions.username = principalId;
                cluster.options.redisOptions.password = token;
                this.logger.info(
                    `[RedisMsiConnectionManager] Updated cluster credentials for '${label}' ` +
                    `(applies to all nodes on reconnection)`
                );
            }

            if (!isPeriodicAuthEnabled) {
                this.logger.info(
                    `[RedisMsiConnectionManager] Skipping AUTH for '${label}' ` +
                    `(periodic auth disabled), token updated in options only`
                );
                return;
            }

            // Cluster doesn't have a direct .auth() method like standalone Redis
            // Credentials are automatically applied to all cluster nodes on reconnection via redisOptions
            // Unlike standalone Redis which can AUTH on live connections,
            // Cluster must reconnect to apply new credentials.
            this.logger.info(
                `[RedisMsiConnectionManager] Cluster client '${label}' credentials updated, ` +
                `will apply on next reconnection (status: ${client.status})`
            );
        } catch (error: unknown) {
            Utils.logError(this.logger, error,
                `[RedisMsiConnectionManager] Failed to authenticate Cluster client '${label}' | ` +
                `status=${client.status || 'unknown'}`,
                'RedisMsiConnectionManager.authenticateClusterClient');
        }
    }

    /**
     * Setup event handlers for client lifecycle and errors
     * Works with both Redis and Cluster clients (they share the same event API)
     */
    private setupClientEventHandlers(
        client: Redis | Cluster,
        connectionName: string,
        component: string,
        clientType: RedisClientType
    ): void {
        let isReconnection = false;

        client.on('error', (error: any) => {
            // Log error with identifying context
            Utils.logError(this.logger, error,
                `[${component}] ${clientType} client '${connectionName}' error | status=${client.status || 'unknown'}`,
                'RedisMsiConnectionManager.setupClientEventHandlers');
        });

        // Log when commands timeout to identify which client has issues
        client.on('commandTimeout', (command: any, timeout: number) => {
            const commandName = command?.name || 'unknown';
            const isAuthCommand = String(commandName).toLowerCase() === 'auth';
            this.logger.error({
                message:
                    `[${component}] ${clientType} client '${connectionName}' command timeout: ` +
                    `${commandName} | timeoutMs=${timeout} | status=${client.status || 'unknown'} | ` +
                    `isAuthCommand=${isAuthCommand} | errorName=RedisCommandTimeout | ` +
                    `errorCode=REDIS_COMMAND_TIMEOUT`,
                context: 'RedisMsiConnectionManager.setupClientEventHandlers'
            });
        });

        client.on('close', () => {
            this.logger.info(`[${component}] ${clientType} client '${connectionName}' connection closed`);
        });

        client.on('reconnecting', (timeUntilRetry: number) => {
            isReconnection = true;
            this.logger.info(
                `[${component}] ${clientType} client '${connectionName}' ` +
                `reconnecting in ${timeUntilRetry}ms`
            );
        });

        // ioredis automatically authenticates using username/password from options
        // This happens BEFORE emitting 'ready' for both initial connection and reconnection
        // We only need explicit AUTH during periodic token refresh (to rotate credentials on live connections)
        client.on('ready', () => {
            if (isReconnection) {
                this.logger.info(
                    `[${component}] ${clientType} client '${connectionName}' reconnected ` +
                    `(AUTH completed via updated options)`
                );
                isReconnection = false;
            } else {
                this.logger.info(
                    `[${component}] ${clientType} client '${connectionName}' initial connection ready ` +
                    `(AUTH completed via options)`
                );
            }
        });
    }

    /**
     * Type guard to check if client is a standalone Redis instance
     */
    private isRedisClient(client: Redis | Cluster): client is Redis {
        return client instanceof Redis;
    }
}
