// ============================================================================
// Copyright 2017-2024, Schlumberger
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
export interface ImpersonationTokenModel {
    impersonation_token: string;
    expires_in: number;
    token_type: string;
    context: string;
}

// Impersonation Token Resource
export interface ImpersonationTokenResourceModel {
    resource: string;
    readonly: boolean;
}

// Impersonation Token Request Body
export interface ImpersonationTokenRequestBodyModel {
    resources: ImpersonationTokenResourceModel[];
    userToken: string;
    metadata: object;
}

// Impersonation Token Context Model
export interface ImpersonationTokenContextModel {
    resources: ImpersonationTokenResourceModel[];
    metadata: object;
    user: string;
    impersonated_by: string;
    userAzp: string;
}
