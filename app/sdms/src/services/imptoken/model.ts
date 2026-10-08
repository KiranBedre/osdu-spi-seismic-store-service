// ============================================================================
// Copyright 2017-2019, Schlumberger
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

// Impersonation Token
export interface IImpTokenModel {
    impersonation_token: string;
    expires_in: number;
    token_type: string;
}

// Resource
export interface IResourceModel {
    resource: string;
    readonly: boolean;
}

// Impersonation Token Body
export interface IImpTokenBodyModel {
    user: string;
    resources: IResourceModel[];
    refreshUrl: string;
    iat: number;
    userToken: string;
}

// Refresh URL general model
export interface IRefreshUrl {
    method: string;
    url: string;
    headers: object;
    body: object;
}
