// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { Utils } from './utils';

export class Config {
    public static url: string | undefined;
    public static osduUrl: string | undefined;
    public static partition: string | undefined;
    public static idToken: string | undefined;
    public static pAdminToken: string | undefined;
    public static pEditorToken: string | undefined;
    public static pViewerToken: string | undefined;
    public static pNonRegToken: string | undefined;
    public static pAdminUserId: string | undefined;
    public static pEditorUserId: string | undefined;
    public static pViewerUserId: string | undefined;
    public static pNonRegUserId: string | undefined;
    public static aclOwners: string | undefined;
    public static aclViewers: string | undefined;
    public static legalTags: string | undefined;

    public static load() {
        this.url = process.env.URL;
        this.osduUrl = process.env.OSDU_URL;
        this.partition = process.env.PARTITION;
        this.idToken = process.env.TOKEN;
        this.pAdminToken = process.env.PARTITION_ADMIN_TOKEN;
        this.pEditorToken = process.env.PARTITION_EDITOR_TOKEN;
        this.pViewerToken = process.env.PARTITION_VIEWER_TOKEN;
        this.pNonRegToken = process.env.PARTITION_NONREG_TOKEN;
        this.aclOwners = process.env.ACL_ADMINS;
        this.aclViewers = process.env.ACL_VIEWERS;
        this.legalTags = process.env.LEGALTAGS;
        this.pAdminUserId = Utils.getTokenPayloadField(this.pAdminToken, 'sub');
        this.pEditorUserId = Utils.getTokenPayloadField(this.pEditorToken, 'sub');
        this.pViewerUserId = Utils.getTokenPayloadField(this.pViewerToken, 'sub');
        this.pNonRegUserId = Utils.getTokenPayloadField(this.pNonRegToken, 'sub');
    }
}
