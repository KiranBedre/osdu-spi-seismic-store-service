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

import { DefaultAzureCredential } from '@azure/identity';
import jwt_decode from 'jwt-decode';
import { Config, LoggerFactory } from '../../..';

/**
 * Manages MSI (Managed Service Identity) token acquisition and caching for Redis authentication
 */
export class MSITokenProvider {
    private static readonly REDIS_SCOPE = 'https://redis.azure.com/.default';
    private static readonly TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer before expiry

    private credential: DefaultAzureCredential;
    private cachedToken: string | null = null;
    private tokenExpiresAt: number | null = null;
    private cachedPrincipalId: string | null = null;
    private logger: any;

    constructor() {
        this.credential = new DefaultAzureCredential();
        this.logger = Config.CLOUDPROVIDER ? LoggerFactory.build(Config.CLOUDPROVIDER) : console;
    }

    /**
     * Gets a valid MSI token and PrincipalId for Redis authentication
     * Returns cached values if still valid, otherwise acquires new token
     */
    public async getTokenAndPrincipalId(): Promise<{ token: string; principalId: string }> {
        if (this.cachedToken && this.cachedPrincipalId && this.tokenExpiresAt) {
            const now = Date.now();
            const timeUntilExpiry = this.tokenExpiresAt - now;

            // Return cached values if token has more than the buffer time remaining
            if (timeUntilExpiry > MSITokenProvider.TOKEN_EXPIRY_BUFFER_MS) {
                return { token: this.cachedToken, principalId: this.cachedPrincipalId };
            }
        }

        // Acquire new token if no valid cache
        return await this.refreshToken();
    }

    /**
     * Explicitly refreshes the MSI token and extracts the PrincipalId
     * @returns Object containing the new token and PrincipalId
     */
    public async refreshToken(): Promise<{ token: string; principalId: string }> {
        try {
            const tokenResponse = await this.credential.getToken(MSITokenProvider.REDIS_SCOPE);

            if (!tokenResponse) {
                throw new Error('Failed to acquire MSI token: tokenResponse is null');
            }

            this.cachedToken = tokenResponse.token;
            this.tokenExpiresAt = tokenResponse.expiresOnTimestamp;

            // Extract and cache PrincipalId immediately to avoid redundant token calls
            this.cachedPrincipalId = this.extractPrincipalIdFromToken(this.cachedToken);

            const expiresOnTimestamp = tokenResponse.expiresOnTimestamp;
            const expiresAt = new Date(expiresOnTimestamp).toISOString();
            this.logger.info(
                `[MSITokenProvider] MSI token acquired for Redis. ` +
                `PrincipalId: ${this.cachedPrincipalId}, Expires at: ${expiresAt}`
            );

            return { token: this.cachedToken, principalId: this.cachedPrincipalId };
        } catch (error: any) {
            // Log only safe, non-sensitive error information
            this.logger.error('[MSITokenProvider] Failed to acquire MSI token for Redis', {
                error: {
                    name: error?.name || 'UnknownError',
                    message: error?.message || 'No error message available',
                    code: error?.code || error?.statusCode || 'N/A'
                }
            });
            throw error;
        }
    }

    /**
     * Extracts the PrincipalId (oid claim) from a JWT token
     * @param token - The JWT token to decode
     * @returns The PrincipalId from the token
     * @throws Error if the token is invalid or doesn't contain the oid claim
     */
    private extractPrincipalIdFromToken(token: string): string {
        try {
            const payload = jwt_decode<{ oid?: string }>(token);

            const principalId = payload.oid;
            if (!principalId) {
                throw new Error(
                    'No "oid" (PrincipalId) claim found in token. Ensure the token is from a Managed Identity.'
                );
            }

            this.logger.info(`[MSITokenProvider] Extracted PrincipalId from token: ${principalId}`);
            return principalId;
        } catch (error: any) {
            const errorMsg =
                `[MSITokenProvider] Failed to extract PrincipalId from token: ` +
                `${error?.message || 'Unknown error'}`;
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
        }
    }
}
