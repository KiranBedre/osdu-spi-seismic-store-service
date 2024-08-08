// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import * as crypto from 'crypto';
import * as JsYaml from 'js-yaml';
import * as JsonRefs from 'json-refs';
import { Operator } from '../services/dataset/model';

import { Config, CredentialsFactory } from '../cloud';

export class Utils {

    public static async resolveJsonRefs(filepath: string) {
        JsonRefs.clearCache();
        const result = await JsonRefs.resolveRefsAt(
            filepath, {
            filter: ['relative', 'remote'],
            loaderOptions: {
                processContent(res: any, callback: any) {
                    callback(null, JsYaml.load(res.text));
                }
            },
            resolveCirculars: true
        });

        return result.resolved;
    }

    public static getPropertyFromTokenPayload(base64JwtPayload: string, property: string): string {
        const payload = this.getPayloadFromStringToken(base64JwtPayload);
        return property in payload ? payload[property] : undefined;
    }

    public static async getUserId(authorization: string, forwardedUserIdByProxy: string): Promise<string> {

        // try to get the user id from GDPR compliant key
        let userId = Utils.getPropertyFromTokenPayload(authorization, Config.GDPR_COMPLIANT_USER_ID_KEY);

        // try to use the forwarded user id by proxy if this is set
        if(!userId) {
            userId = forwardedUserIdByProxy;
        }

        // try to get the user id from provider specific rule
        if (!userId && Config.USER_ID_FROM_PROVIDER_API) {
            const cloudProvider = Config.CLOUDPROVIDER;
            const credClient = CredentialsFactory.build(cloudProvider);
            userId = await credClient.getUserId(authorization);
        }

        // try to get the user id from old sdms default settings (to keep backward compatibility)
        if (!userId) {
            userId = Utils.getPropertyFromTokenPayload(authorization, Config.USER_ID_CLAIM_FOR_SDMS);
        }

        // if not possible get the id with previous strategies by default just use the sub
        if (!userId) {
            userId = Utils.getSubFromPayload(authorization)
        }

        return userId;

    }

    // This method is temporary required by slb during the migration of sauth from v1 to v2
    // The method replace slb.com domain name with delfiserviceaccount.com.t
    // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
    // Others service domain won't be affected by this call
    public static checkSauthV1EmailDomainName(email: string): string {
        return Config.CLOUDPROVIDER === 'google' && email.endsWith('slbservice.com@slb.com') ?
            email.replace('slbservice.com@slb.com', 'slbservice.com@delfiserviceaccount.com') : email;
    }

    public static getIssFromPayload(base64JwtPayload: string): string {
        return this.getPayloadFromStringToken(base64JwtPayload).iss;
    }

    public static getExpTimeFromPayload(base64JwtPayload: string): number {
        return Number(this.getPayloadFromStringToken(base64JwtPayload).exp);
    }

    public static getAudienceFromPayload(base64JwtPayload: string): string | string[] {
        return this.getPayloadFromStringToken(base64JwtPayload).aud;
    }

    public static getSubFromPayload(base64JwtPayload: string): string {
        return this.getPayloadFromStringToken(base64JwtPayload).sub;
    }

    // Authorized party - The party to which the token was issued to
    public static getAzpFromPayload(base64JwtPayload: string): string {
        return this.getPayloadFromStringToken(base64JwtPayload).azp;
    }

    public static makeID(len: number): string {
        let id = '';
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < len; i++) {
            id += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return id;
    }

    public static getPayloadFromStringToken(base64JwtPayload: string): any {

        if (base64JwtPayload === undefined) { return undefined; }

        base64JwtPayload = base64JwtPayload.replace(' ', '');
        base64JwtPayload = base64JwtPayload.replace('Bearer', '');
        const base64JwtPayloadTokens = base64JwtPayload.split('.');

        base64JwtPayload = base64JwtPayloadTokens.length === 3 ? base64JwtPayloadTokens[1] : base64JwtPayload;

        const missingPadding = base64JwtPayload.length % 4;
        if (missingPadding !== 0) {
            base64JwtPayload += '='.repeat(4 - missingPadding);
        }

        return JSON.parse(Buffer.from(base64JwtPayload, 'base64').toString());

    }

    public static encrypt(text: string, key: string) {
        const iv = crypto.randomBytes(16);
        const keySign = crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keySign), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return {
            encryptedText: encrypted.toString('hex'),
            encryptedTextIV: iv.toString('hex'),
            authTag: cipher.getAuthTag().toString('hex')
        };
    }

    // This method is temporary required by slb during while migrating from AES CBC to AES GCM
    // To be removed
    public static decryptCBC(encryptedText: string, encryptedTextIV: string, key: string) {
        const keySign = crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
        const ivNew = Buffer.from(encryptedTextIV, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keySign), ivNew);
        let decrypted = decipher.update(Buffer.from(encryptedText, 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    public static decrypt(encryptedText: string, encryptedTextIV: string, authTag: string, key: string) {
        const keySign = crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
        const ivNew = Buffer.from(encryptedTextIV, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keySign), ivNew);
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        let decrypted = decipher.update(Buffer.from(encryptedText, 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    public static isEmail(input: string): boolean {
        const regexp = new RegExp(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);
        /* tslint:enable: max-line-length */
        if (!regexp.test(input)) {
            return false;
        }
        return true;

    }

    public static isBoolean(input: string): boolean {

        switch(input.toLowerCase()) {
            case 'true':
            case 'false':
                return true;
            default:
                return false;
        }
    }

    // retry on error using exponential retry backOff strategy.
    // wait*2^1+e, wait*2^2+e, wait*2^3+e, wait*2^(retryMaxAttempts)+e
    // 200ms 400ms 800ms 1600ms ...
    public static async exponentialBackOff(
        methodToCall: any, retryMaxAttempts = 5): Promise<void> {
        let retries = 0;
        const waitTime = 200;
        while (true) {
            try {
                return await methodToCall();
            } catch (error) {
                if (retryMaxAttempts === ++retries) {
                    throw (error);
                }
                await new Promise(resolve => setTimeout(
                    resolve, ((2 ** (retries - 1)) * waitTime) + Math.random() * 100));
            }
        }
    }

    public static sanitizeFieldName(userInput: string): string {
        // remove spaces at the start and and the end of the string
        const sanitizedInput = userInput.replace(/^\s+|\s+$/g, '');

        if (!/^[a-zA-Z0-9_\s]+$/.test(sanitizedInput)) {
            throw new Error('`' +userInput + '` contains invalid characters. Only letters, numbers, space and _ are allowed.');
        }

        return sanitizedInput;
    }

    static sanitizeOperator(operator: Operator): Operator {
        switch (operator) {
            case '=':
            case '!=':
            case '<':
            case '>':
            case '<=':
            case '>=':
            case 'CONTAINS':
            case 'RegexMatch':
            case 'LIKE':
            case 'STARTSWITH':
                return operator;
            default:
                throw new Error('Operator `' + operator + '` not supported');
        }
    }
}
