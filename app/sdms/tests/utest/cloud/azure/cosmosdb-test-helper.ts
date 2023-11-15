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

import { FeedResponse } from '@azure/cosmos';

export class CosmosDbTestHelper {

    public static getQueryIterator(resources = ['resources']) {
        let feedResponse: FeedResponse<any> = {
            resources: resources,
            headers: undefined,
            hasMoreResults: false,
            continuation: '',
            continuationToken: 'continuationToken',
            queryMetrics: '',
            requestCharge: 0,
            activityId: ''
        } as any;
        return {
            clientContext: undefined,
            query: undefined,
            options: undefined,
            fetchFunctions: undefined,
            fetchAllTempResources: undefined,
            fetchAllLastResHeaders: undefined,
            queryExecutionContext: undefined,
            queryPlanPromise: undefined,
            isInitialized: undefined,
            getAsyncIterator: function (): AsyncIterable<FeedResponse<any>> {
                throw new Error('Function not implemented.');
            },
            hasMoreResults: function (): boolean {
                throw new Error('Function not implemented.');
            },
            fetchAll: function (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            fetchNext: function (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            reset: function (): void {
                throw new Error('Function not implemented.');
            },
            toArrayImplementation: undefined,
            createPipelinedExecutionContext: undefined,
            fetchQueryPlan: undefined,
            needsQueryPlan: undefined,
            initPromise: undefined,
            init: undefined,
            _init: undefined,
            handleSplitError: undefined
        };
    }
}