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

import { Error } from '../../shared';
import { ISDPathModel } from '../../shared/sdpath';

export interface IDatasetModel {
    name: string;
    tenant: string;
    subproject: string;
    path: string;
    created_date: string;
    last_modified_date: string;
    created_by: string;
    metadata: any;
    filemetadata: any;
    gcsurl: string;
    type: string;
    ltag: string;
    ctag: string;
    sbit: string;
    sbit_count: number;
    gtags: string[];
    readonly: boolean;
    seismicmeta_guid: string;
    transfer_status: string;
    acls?: IDatasetAcl;
    access_policy: string;
    storageSchemaRecordType?: string;
    storageSchemaRecord?: any;
    computed_size?: number;
    computed_size_date?: string;
}

export interface IDatasetListRequest {
    dataset: IDatasetModel,
    pagination: IPaginationModel,
    userInfo: boolean,
    search: string,
    select: string[],
    filter: QueryFilter,
}

export interface IBulkDeleteRequest {
    sdPath: ISDPathModel,
    filter?: QueryFilter,
}

export interface IPaginationModel {
    limit: number;
    cursor: string;
}

export interface IDatasetAcl {
    admins: string[],
    viewers: string[];
}

export interface PaginatedDatasetList {
    datasets: IDatasetModel[];
    nextPageCursor: string;
}

export interface SchemaTransformModel {
    transformFuncID: string,
    data: any,
    nextTransformFuncID: string;
}

export interface ComputedSizeResponse {
    computed_size: number;
    computed_size_date: any;
}

export interface GetSizeResponse {
    size_bytes: number;
    dataset_count: number;
}

export interface ListDatasetsParams {
    dataset: IDatasetModel,
    pagination?: IPaginationModel,
    searchParam?: string,
    selectParam?: string[],
    filter?: QueryFilter,
    // if true, datasets will be retrieved recursively,
    // including in the subfolders of the specified path
    recursive?: boolean
}

export interface QueryFilter {
    accept(visitor: QueryFilterVisitor): void;
}

export abstract class QueryFilterVisitor {
    visitAnd(element: AndQueryFilter): void {
        QueryFilterVisitor.notImplemented()
    }
    visitMatch(element: MatchQueryFilter): void {
        QueryFilterVisitor.notImplemented()
    }
    visitNot(element: NotQueryFilter): void {
        QueryFilterVisitor.notImplemented()
    }
    visitOr(element: OrQueryFilter): void {
        QueryFilterVisitor.notImplemented()
    }
    private static notImplemented(): void {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED,
            'The required query filter operation is not supported.'));
    }
}

export class AndQueryFilter implements QueryFilter {
    filters: QueryFilter[];

    constructor(...filters:QueryFilter[]) {
        this.filters = filters;
    }

    public accept(visitor: QueryFilterVisitor): void {
        visitor.visitAnd(this);
    }
}

export class OrQueryFilter implements QueryFilter {
    filters: QueryFilter[];

    constructor(...filters: QueryFilter[]) {
        this.filters = filters;
    }

    public accept(visitor: QueryFilterVisitor): void {
        visitor.visitOr(this);
    }
}

export class NotQueryFilter implements QueryFilter {
    filter: QueryFilter;

    constructor(filter: QueryFilter) {
        this.filter = filter;
    }

    public accept(visitor: QueryFilterVisitor): void {
        visitor.visitNot(this);
    }
}
export type Operator = '!=' | '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'CONTAINS' | 'RegexMatch' | 'LIKE' | 'STARTSWITH';

export class MatchQueryFilter implements QueryFilter {
    property: string; operator: Operator; value: {};

    constructor(property: string, operator: Operator, value: {}) {
        this.property = property;
        this.operator = operator;
        this.value = value;
    }

    public accept(visitor: QueryFilterVisitor): void {
        visitor.visitMatch(this);
    }
}
