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

import { IDatasetV3, IDatasetV4 } from './model';

import { Config } from '../cloud';
import { Utils } from '../shared';

export class Parser {
    public static generateSyncV3V4Msg(records: IDatasetV4[], recordIds: string[], dataPartition: string) {
        const messages = [];
        for (const [index, record] of records.entries()) {
            const v3_record: IDatasetV3 = {
                id: recordIds[index],
                data: {
                    name: this.getDatasetName(record),
                    tenant: dataPartition,
                    subproject: Config.SDMS_V3_V4_SYNC_SUBPROJECT,
                    path: '/',
                    acls: {
                        admins: record.acl.owners,
                        viewers: record.acl.viewers,
                    },
                    ltag: this.getLtag(record),
                    created_by: record?.createUser,
                    created_date: record?.createTime,
                    last_modified_date: record?.modifyTime,
                    gcsurl: Utils.constructBucketID(recordIds[index]),
                    ctag: Utils.generateRandomData(16),
                    readonly: false,
                    seismicmeta_guid: record?.id,
                },
            };

            if (record.data?.DatasetProperties.FileCollectionPath) {
                v3_record.data.path = record.data.DatasetProperties.FileCollectionPath;
            }
            messages.push(v3_record);
        }

        return messages;
    }

    private static getDatasetName(v4_record: IDatasetV4): string {
        if (v4_record.data?.Name) {
            return v4_record.data.Name;
        } else if (
            v4_record.data?.DatasetProperties.FileSourceInfos &&
            v4_record.data?.DatasetProperties.FileSourceInfos[0]?.Name
        ) {
            return v4_record.data.DatasetProperties.FileSourceInfos[0].Name;
        } else {
            return v4_record?.id;
        }
    }

    private static getLtag(v4_record: IDatasetV4): string {
        if (v4_record.legal.legaltags) {
            return v4_record.legal.legaltags[0];
        }
    }
}
