// ============================================================================
// Copyright 2017-2024, Schlumberger
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

export class Config {
    public static url: string | undefined;
    public static partition: string | undefined;
    public static idToken: string | undefined;
    public static aclOwners: string | undefined;
    public static aclViewers: string | undefined;
    public static legalTags: string | undefined;
    public static retries: number;

    public static load() {
        this.url = process.env.URL;
        this.partition = process.env.PARTITION;
        this.idToken = process.env.TOKEN;
        this.aclOwners = process.env.ACL_ADMINS;
        this.aclViewers = process.env.ACL_VIEWERS;
        this.legalTags = process.env.LEGALTAGS;
        this.retries = process.env.RETRY ? +process.env.RETRY : 5; // 5 is default retry count
    }
}
