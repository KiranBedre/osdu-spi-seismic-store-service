// ============================================================================
// Copyright 2023, Microsoft
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

import { AndQueryFilter, MatchQueryFilter, NotQueryFilter, OrQueryFilter, QueryFilter } from '.';
import { Error } from '../../shared';

export class DatasetFilterParser {

    public static parseFilter(input: any): QueryFilter {
        if (input.and) {
            this.disallowExtraKeys(input);
            return new AndQueryFilter(...(this.parseFilters(input.and)));
        }
        if (input.or) {
            this.disallowExtraKeys(input);
            return new OrQueryFilter(...(this.parseFilters(input.or)));
        }
        if (input.not) {
            this.disallowExtraKeys(input);
            return new NotQueryFilter(this.parseFilter(input.not));
        }
        return DatasetFilterParser.parseMatch(input);
    }

    private static parseFilters(input: any): QueryFilter[] {
        const inputs = input as any[];
        if (!inputs.length) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Filter list missing.'));
        }

        return inputs.map(i => this.parseFilter(i));
    }

    private static parseMatch(input: any): MatchQueryFilter {
        let type;
        switch (typeof input.value) {
            case 'boolean':
                type = 'BOOLEAN';
                break;
            case 'number':
                type = 'NUMBER';
                break;
            default:
                type = 'STRING';
        }

        if (!input.property) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Filter property missing.'));
        }
        if (!input.operator) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Filter operator missing.'));
        }
        return new MatchQueryFilter(input.property, input.operator, input.value, type);
    }

    private static disallowExtraKeys(input: any) {
        if (Object.keys(input).length > 1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Unexpected filter property.'));
        }
    }
}
