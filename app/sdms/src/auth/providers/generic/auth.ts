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

import { ImpersonationTokenModel } from '../../../services/impersonation_token/model';
import { Error } from '../../../shared';
import { AbstractAuthProvider, AuthProviderFactory } from '../../auth';

@AuthProviderFactory.register('generic')
export class GenericAuthProvider extends AbstractAuthProvider {
    public async generateAuthCredential(): Promise<any> {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED,
            'The required feature is not supported, the credential auth provider has not been found.'));
    }

    public generateScopedAuthCredential(scopes: string[]): Promise<any> {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED,
            'The required feature is not supported, the credential auth provider has not been found.'));
    }

    public convertToImpersonationTokenModel(credential: any): ImpersonationTokenModel {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED,
            'The required feature is not supported, the credential auth provider has not been found.'));
    }

    public getClientID(): string {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED,
            'The required feature is not supported, the credential auth provider has not been found.'));
    }

    public getClientSecret(): string {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED,
            'The required feature is not supported, the credential auth provider has not been found.'));
    }

    public exchangeCredentialAudience(credential: string, audience: string): Promise<string> {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED,
            'The required feature is not supported, the credential auth provider has not been found.'));
    }

}
