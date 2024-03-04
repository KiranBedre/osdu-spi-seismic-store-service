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

import { SchemaEndpoint, SchemaEndpoints } from '../apis/schema/types';
import express from 'express';

export class Context {
    public static schemaEndpoint: SchemaEndpoint;
    public static endpointId: string;

    public static reset() {
        Context.schemaEndpoint = undefined;
        Context.endpointId = undefined;
    }

    public static getEndpointSchema(req: express.Request) {
        for (const endpoint of SchemaEndpoints) {
            if (req.originalUrl.indexOf('/' + endpoint.name + '/') !== -1) {
                Context.schemaEndpoint = endpoint;
                break;
            }
        }
    }
}
