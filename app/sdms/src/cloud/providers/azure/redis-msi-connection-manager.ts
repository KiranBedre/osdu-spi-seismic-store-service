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

import Redis, { type RedisOptions } from 'ioredis';
import { Config, LoggerFactory } from '../..';
import { MSITokenProvider } from './msi-token-provider';

/**
 * Manages Redis connections with MSI authentication, including token refresh and cleanup
 * Singleton pattern to ensure only one token provider and refresh timer across all Redis clients
 */
export class RedisMsiConnectionManager {
    private static instance: RedisMsiConnectionManager | null = null;

    private refreshTimer: NodeJS.Timeout | null = null;
    public readonly msiTokenProvider: MSITokenProvider;
    private readonly REFRESH_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes
    private readonly CONNECTION_TIMEOUT_MS = 30000; // 30 seconds
    private readonly logger: any;

    // Track clients for token refresh
    private registeredClients: { client: Redis; label: string; isPeriodicAuthEnabled: boolean }[] = [];

    private constructor() {
        this.msiTokenProvider = new MSITokenProvider();
        this.logger = Config.CLOUDPROVIDER ? LoggerFactory.build(Config.CLOUDPROVIDER) : console;
    }

    /**
     * Get the singleton instance of RedisMsiConnectionManager
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
     * Encapsulates the common pattern of creating options, instantiating client,
     * and waiting for ready state
     * @param isPeriodicAuthEnabled - If false, skips periodic AUTH commands
     * (use for Redis pub/sub subscribers or blocking clients)
     * @returns A ready Redis client that is registered for automatic token refresh
     */
    public async initializeRedisClient(
        host: string,
        port: number,
        disableTls: boolean,
        connectionName: string,
        component: string,
        baseOptions: Partial<RedisOptions>,
        isPeriodicAuthEnabled: boolean
    ): Promise<Redis> {
        const redisOptions = await this.createMsiRedisOptions(
            host,
            port,
            disableTls,
            connectionName,
            baseOptions
        );

        const client = new Redis(redisOptions);

        // Setup event handlers BEFORE waiting for ready to catch all errors and lifecycle events
        this.setupClientEventHandlers(client, connectionName, component);

        await this.waitForRedisReady(client, connectionName, component, isPeriodicAuthEnabled);
        return client;
    }

    /**
     * Waits for a single Redis client to be ready with timeout protection.
     * Also registers the client for automatic token refresh.
     *
     * Per Azure documentation: "client applications must periodically refresh the Microsoft Entra
     * token before expiry. Then the apps must send an AUTH command to avoid disrupting connections."
     * Best practice: "at least three minutes before token expiry"
     *
     * Refresh strategy (every 45 minutes):
     * 1. Fetch new token and update cache
     * 2. Run AUTH command on all clients with the new token
     *
     * With 24-hour token validity observed during testing,
     * 45-minute refresh provides ample safety margin.
     */
    public async waitForRedisReady(
        client: Redis,
        label: string,
        component: string,
        isPeriodicAuthEnabled: boolean
    ): Promise<void> {
        // Check if already ready
        if (client.status === 'ready') {
            this.logger.info(`[${component}] Redis client '${label}' already connected`);
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
                    this.logger.info(`[${component}] Redis client '${label}' connected with MSI auth`);
                    resolve();
                }
            };

            const onError = (err: any) => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    this.logger.error(
                        `[${component}] Redis client '${label}' connection/auth error: ` +
                        `${err?.message}`
                    );
                    reject(err);
                }
            };

            // Set timeout to prevent indefinite hanging
            timeoutHandle = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    const errorMsg =
                        `[${component}] Redis client '${label}' authentication timeout after ` +
                        `${this.CONNECTION_TIMEOUT_MS}ms. Status: ${client.status || 'unknown'}. ` +
                        `Check Redis AAD authentication configuration.`;
                    this.logger.error(errorMsg);
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
     * Note: Callers are responsible for disconnecting own Redis clients and closing queues
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
            `(every ${this.REFRESH_INTERVAL_MS / 1000}s)`
        );

        this.refreshTimer = setInterval(async () => {
            try {
                this.logger.info(
                    `[RedisMsiConnectionManager] Refreshing MSI token and re-authenticating ` +
                    `${this.registeredClients.length} clients...`
                );

                // Force token refresh by calling Azure (MSITokenProvider will cache it)
                await this.msiTokenProvider.refreshToken();

                // Re-authenticate all clients with the refreshed token
                for (const { client, label, isPeriodicAuthEnabled } of this.registeredClients) {
                    await this.authenticateClient(client, label, isPeriodicAuthEnabled);
                }

                this.logger.info(
                    `[RedisMsiConnectionManager] Token refresh and re-authentication cycle completed`
                );
            } catch (error: any) {
                const errorDetails = {
                    operation: 'refresh',
                    timestamp: new Date().toISOString(),
                    name: error?.name || 'UnknownError',
                    message: error?.message || 'No error message available',
                    code: error?.code || error?.statusCode || 'N/A',
                    clientLabels: this.registeredClients.map(({ label }) => label)
                };
                this.logger.error(
                    `[RedisMsiConnectionManager] Failed to refresh token and re-authenticate: ` +
                    `${JSON.stringify(errorDetails)}`
                );
                if (error?.stack) {
                    this.logger.error(`[RedisMsiConnectionManager] Stack trace: ${error.stack}`);
                }
            }
        }, this.REFRESH_INTERVAL_MS);
    }

    /**
     * Register a client for token refresh (idempotent - prevents duplicates)
     * Automatically starts token refresh timer when first client is registered
     * NOTE: Does NOT run AUTH here - ioredis handles initial auth via options
     * @param isPeriodicAuthEnabled - If false, periodic AUTH will be skipped
     * (credentials still updated in options)
     */
    private registerClient(client: Redis, label: string, isPeriodicAuthEnabled: boolean): void {
        const alreadyRegistered = this.registeredClients.some(
            registered => registered.client === client
        );

        if (!alreadyRegistered) {
            const isFirstClient = this.registeredClients.length === 0;

            this.registeredClients.push({ client, label, isPeriodicAuthEnabled });
            this.logger.info(
                `[RedisMsiConnectionManager] Registered client '${label}' for token refresh ` +
                `${!isPeriodicAuthEnabled ? '(periodic AUTH disabled)' : ''}`
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
     * Authenticate a single client with current MSI token
     * Called during periodic token refresh to:
     * 1. Update client.options (ioredis reads these on next reconnection)
     * 2. Run AUTH on live connections (to rotate credentials without reconnecting)
     *
     * @param isPeriodicAuthEnabled - If false, skips AUTH command but still updates options
     *   Use for Redis clients in special modes (pub/sub subscribers, blocking BRPOP clients)
     */
    private async authenticateClient(
        client: Redis,
        label: string,
        isPeriodicAuthEnabled: boolean
    ): Promise<void> {
        try {
            const { token, principalId } = await this.msiTokenProvider.getTokenAndPrincipalId();

            // Update client options for future reconnections
            // Both username and password must be updated for MSI auth
            (client as any).options.username = principalId;
            (client as any).options.password = token;

            // Skip AUTH if disabled (e.g., Redis subscriber or blocking client)
            // These clients are in special modes where AUTH is not allowed or would block
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
        } catch (error: any) {
            this.logger.error(
                `[RedisMsiConnectionManager] Failed to authenticate client '${label}': ${error?.message}`,
                {
                    label,
                    errorMessage: error?.message,
                    errorCode: error?.code,
                    redisStatus: client.status,
                    timestamp: new Date().toISOString()
                }
            );
        }
    }

    /**
     * Setup event handlers for Redis client lifecycle and errors
     * Handles error, timeout, connection, and ready events for monitoring and auto-reauth
     */
    private setupClientEventHandlers(client: Redis, connectionName: string, component: string): void {
        let isReconnection = false;

        client.on('error', (error: any) => {
            // Log error with identifying context
            this.logger.error(
                `[${component}] Redis client '${connectionName}' error: ${error?.message || 'Unknown error'}`,
                {
                    error: error?.message,
                    code: error?.code,
                    redisStatus: client.status,
                    timestamp: new Date().toISOString()
                }
            );
        });

        // Log when commands timeout to identify which client has issues
        client.on('commandTimeout', (command: any, timeout: number) => {
            this.logger.error(
                `[${component}] Redis client '${connectionName}' command timeout: ${command?.name || 'unknown'}`,
                {
                    commandName: command?.name,
                    commandArgs: command?.args,
                    timeout,
                    redisStatus: client.status,
                    timestamp: new Date().toISOString()
                }
            );
        });

        client.on('close', () => {
            this.logger.info(`[${component}] Redis client '${connectionName}' connection closed`);
        });

        client.on('reconnecting', (timeUntilRetry: number) => {
            isReconnection = true;
            this.logger.info(
                `[${component}] Redis client '${connectionName}' reconnecting in ${timeUntilRetry}ms`
            );
        });

        // ioredis automatically authenticates using username/password from options
        // This happens BEFORE emitting 'ready' for both initial connection
        // and reconnection. We only need explicit AUTH during periodic token refresh
        // (to rotate credentials on live connections)
        client.on('ready', () => {
            if (isReconnection) {
                this.logger.info(
                    `[${component}] Redis client '${connectionName}' reconnected ` +
                    `(AUTH completed via updated options)`
                );
                isReconnection = false;
            } else {
                this.logger.info(
                    `[${component}] Redis client '${connectionName}' initial connection ready ` +
                    `(AUTH completed via options)`
                );
            }
        });
    }
}
