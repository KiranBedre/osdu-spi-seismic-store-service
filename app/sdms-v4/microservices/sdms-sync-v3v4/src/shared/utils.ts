// ============================================================================
// Copyright 2017-2025, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import crypto from 'crypto';

export class Utils {
    public static async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public static decodeBase64(str: string) {
        return Buffer.from(str, 'base64').toString('binary');
    }

    public static PreBearerToken(token: string): string {
        return token.startsWith('Bearer') ? token : 'Bearer ' + token;
    }

    public static getContainerIdFromGcsurl(gcsUrl: string): string {
        const fileCollectionId = gcsUrl.split(':').slice(0, -1).join(':'); // remove the version
        return Utils.constructBucketID(fileCollectionId);
    }
    public static constructBucketID(recordID: string) {
        return crypto.createHash('sha256').update(recordID).digest('hex').slice(0, -1);
    }
}
