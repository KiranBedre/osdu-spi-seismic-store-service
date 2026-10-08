// ============================================================================
// Copyright 2017-2022, Schlumberger
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

export class CloudFactory {
    public static register(providerLabel: string) {
        return (target: any) => {
            if (CloudFactory.providers[providerLabel]) {
                CloudFactory.providers[providerLabel].push(target);
            } else {
                CloudFactory.providers[providerLabel] = [target];
            }
            return target;
        };
    }

    public static build(providerLabel: string, referenceAbstraction: any, args: { [key: string]: any } = {}) {
        if (providerLabel === undefined || providerLabel === 'unknown') {
            throw Error('Unrecognized cloud provider: ' + providerLabel);
        }

        for (const provider of CloudFactory.providers[providerLabel]) {
            if (provider.prototype instanceof referenceAbstraction) {
                return new provider(args);
            }
        }
        throw Error('The cloud provider builder that extend ' + referenceAbstraction + ' has not been found');
    }

    private static providers: { [key: string]: any[] } = {};
}
