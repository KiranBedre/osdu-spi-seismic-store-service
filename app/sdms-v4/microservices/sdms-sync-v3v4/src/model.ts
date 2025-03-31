// ============================================================================
// Copyright 2017-2025, Microsoft
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

export interface IDatasetV3 {
    id: string;
    data: {
        name: string;
        tenant: string;
        subproject: string;
        path: string;
        acls?: {
            admins: string[];
            viewers: string[];
        };
        ltag: string;
        created_by: string;
        created_date: string;
        last_modified_date: string;
        filemetadata?: FileMetadata;
        gcsurl: string;
        ctag: string;
        readonly: boolean;
        computed_size?: number;
        computed_size_date?: string;
        seismicmeta_guid: string;
    };
}

export interface BlobInfo {
    name: string;
    size: number;
    tier: string;
}

export interface FileMetadata {
    nobjects: number;
    size: number;
    type: string;
    checksum: string;
    tier_class: string;
}
