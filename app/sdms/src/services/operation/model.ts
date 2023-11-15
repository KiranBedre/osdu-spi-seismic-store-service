// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { OperationType } from './register';

export interface IOperation extends Record<string, string | number | Record<string, string | number>> {
    operation_id: string;
}

export interface IOperationQueueTask extends IOperation {
    type: OperationType
}

export interface IOperationStatus extends IOperation {
    status: string;
    created_at?: string,
    created_by?: string,
    last_updated_at?: string,
    dataset_cnt?: number,
    completed_cnt?: number,
    failed_cnt?: number
}

// Bulk Delete ------------------------------------------------------------

export interface IBulkDeleteOperationStatusRequest {
    dataPartitionId: string;
    operationId: string;
}

export interface IBulkDeleteOperationQueueTask extends IOperationQueueTask {
    createdBy: string;
    tenant: string;
    subproject: string;
    query: string;
}
