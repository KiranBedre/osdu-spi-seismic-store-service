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

import { Config } from '../cloud';

export interface ISDPathModel {
    tenant: string;
    subproject: string;
    path: string;
    dataset: string;
}

export class SDPath {

    public static getFromString(sdPath: string, isFullDatasetPath = true): ISDPathModel {

        // a valid path must start with sd://
        if (!sdPath || !sdPath.startsWith(Config.SDPATHPREFIX)) { return undefined; }

        // remove sd://
        sdPath = sdPath.replace(Config.SDPATHPREFIX, '');

        // from (//*) to (/)
        while (sdPath.indexOf('//') !== -1) { sdPath = sdPath.replace('//', '/'); }

        // remove (/) if at the end
        if (sdPath.endsWith('/')) { sdPath = sdPath.slice(0, -1); }

        // retrieve the tokens
        let sdPathTokens = sdPath.split('/');

        // remove empty elements
        sdPathTokens = sdPathTokens.filter((el) => el !== undefined  && el !== '');

        // create and initialize the result model
        const sdPathRes = {
            dataset: undefined, path: undefined, subproject: undefined, tenant: undefined,
        } as ISDPathModel;

        // get tenant
        if (sdPathTokens.length > 0) { sdPathRes.tenant = sdPathTokens.shift(); }

        // get subproject and verify subproject is valid
        if (sdPathTokens.length > 0) {
            sdPathRes.subproject = sdPathTokens.shift();
            if (!sdPathRes.subproject.match(/^[a-z][a-z\d\-]*[a-z\d]$/g)) { return undefined }
        }

        // get the dataset if required
        if (isFullDatasetPath && sdPathTokens.length > 0) {
            sdPathRes.dataset = sdPathTokens.pop();
        }

        // retrieve and build the hierarchy path
        if (sdPathTokens.length > 0) { sdPathRes.path = '/' + sdPathTokens.join('/') + '/'; }

        // dataset in root does not have a path, force it
        if (sdPathRes.dataset && !sdPathRes.path) { sdPathRes.path = '/'; }

        // after initialize sdPathRes, verify the path is valid
        if (sdPathRes.path) {if (!sdPathRes.path.match(/^\/(?:[^\/]+\/)*$/)) { return undefined; }}

        // return if not empty
        return sdPathRes;
    }

}
