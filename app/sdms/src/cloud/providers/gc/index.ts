// ============================================================================
// Copyright 2017-2019, Schlumberger
// Copyright 2023 Google LLC
// Copyright 2023 EPAM Systems
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

export { GCS } from './gcs';
export { Credentials } from './credentials';
export { DatastoreDAO, DatastoreTransactionDAO } from './datastore';
export { Logger } from './logger';
export { ConfigGoogle } from './config';
export { GoogleTrace } from './trace';
export { GoogleDataEcosystemServices } from './dataecosystem';
export { GoogleSeistore } from './seistore';

 /* FIXME: This is a dirty workaround to pass access tokens
            Auth.isImpersonationToken can work only with JWT tokens, and since accessTokens are not JWT in GCP,
            the original method fails.
*/
import { Auth } from '../../../auth/index'
Auth.isImpersonationToken = (userToken) => {return false };
