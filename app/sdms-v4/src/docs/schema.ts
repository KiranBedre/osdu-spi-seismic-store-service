// ============================================================================
// Copyright 2017-2023, Schlumberger
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

//information on the structure of each generated piece of the yaml page goes here
export const pathHeader = (filetype: string) => {
    return ` 
  ### ==============================================================================
  ### ${filetype.toUpperCase()} PATHS
  ### ==============================================================================
`;
};

export function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, function (txt: string) {
        return txt.charAt(0).toUpperCase() + txt.substr(1);
    });
}

export interface SchemaComponent {
    title: string;
    in: string;
    name: string;
    description: string;
    required?: boolean;
}

export interface SubSchema {
    title: string;
    description: string;
    type: string;
    example: string;
    minLength?: number;
}

export interface Example {
    title: string;
    summary: string;
    value: string;
}

export const SchemaExamples = [
    {
        title: 'service.status',
        summary: 'service status',
        value: 'status: "running"',
    },
    {
        title: 'service.status.ready',
        summary: 'service readiness status',
        value: 'ready: true',
    },
    {
        title: 'service.info',
        summary: 'service info',
        value: `info: {
          group_id: org.opengroup.osdu.sdms.v4,
          artifact_id: sdms-v4,
          build_time: 2024-03-05T14:03:48.865Z,
          connected_outer_services: []
        }`,
    },
    {
        title: 'record.id.version.list',
        summary: 'record id versioned',
        value: '["osdu:dataset:b47f793a-dc9c-5d11-8d59-6cc611a98926:1653406745040912"]',
    },
    {
        title: 'record.id.list',
        summary: 'records id',
        value: `[
          "osdu:dataset:b47f793a-c19c-5d11-8d59-6aa151a935326",
          "osdu:dataset:b47f793a-ac1d-5d11-2a11-2cc4241a12496",
          "osdu:dataset:b47f793a-ab42-5d11-5f19-3bb615a942536",
        ]`,
    },
    {
        title: 'version.list',
        summary: 'dataset versions',
        value: `[
          "1562066009929332",
          "4533963683653593",
          "4318535353951359",
          "5356498744226145",
        ]`,
    },
] as Example[];

export const SchemaComponents = [
    {
        title: 'data.partition.id',
        in: 'header',
        name: 'data-partition-id',
        description: 'The data partition id',
        required: true,
        schema: {
            title: 'data partition id',
            description: 'identifier of the data partition to query',
            type: 'string',
            minLength: 1,
            example: 'opendes',
        },
    },
    {
        title: 'pagination.limit',
        in: 'query',
        name: 'page-limit',
        description:
            '(optional) The size limit of the page (max number of results). If not set 10 will be used as default value.',
        schema: {
            title: 'pagination limit',
            description: 'The size limit of the page (max number of results).',
            type: 'number',
            example: '10',
        },
    },
    {
        title: 'pagination.token',
        in: 'query',
        name: 'next-page-token',
        description:
            '(optional) The next page token returned from the previous page request. If not set, the first page will be returned.',
        schema: {
            title: 'next page token',
            description:
                'The next page token returned from the previous page request. If not set, the first page will be returned.',
            type: 'string',
            minLength: 1,
            example: '',
        },
    },
    {
        title: 'id',
        in: 'path',
        description: 'The seismic dataset record ID',
        name: 'id',
        required: true,
        schema: {
            title: 'The seismic dataset record ID',
            description: 'THe seismic dataset record ID',
            type: 'string',
            minLength: '1',
            example: '"osdu:dataset:b47f793a-dc9c-5d11-8d59-6cc611a98926"',
        },
    },
    {
        title: 'version',
        in: 'path',
        description: 'The seismic dataset version',
        name: 'version',
        required: true,
        schema: {
            title: 'The seismic dataset version',
            description: 'The seismic dataset version',
            type: 'string',
            minLength: 1,
            example: '"1562066009929332"',
        },
    },
];

export interface FixedSchema {
    name: string;
    title: string;
    description: string;
    type: string;
    properties?: string[];
    items?: string;
}

export const SchemaCollections = [
    {
        name: 'service.status',
        title: 'The service status',
        description: 'The service status',
        type: 'object',
        properties: [
            `status: 
          type: string`,
        ],
    },
    {
        name: 'service.status.ready',
        title: 'The service readiness status',
        description: 'The service readiness status',
        type: 'object',
        properties: [
            `ready: 
          type: boolean`,
        ],
    },
    {
        name: 'service.info',
        title: 'The service info',
        description: 'The service info',
        type: 'object',
        properties: [
            `info: 
          type: object`,
        ],
    },
    {
        name: 'record.id.list',
        title: 'The list of datasets record ID',
        description: 'The list of datasets record ID',
        type: 'array',
        items: 'type: string',
    },
    {
        name: 'record.id.version.list',
        title: 'The list of dataset record ID versioned',
        description: 'The list of dataset record ID versioned',
        type: 'array',
        items: 'type: string',
    },
    {
        name: 'connection.string',
        title: 'The dataset files connection string',
        description: 'The dataset files connection string',
        type: 'object',
        properties: [
            `access_token:
          type: string`,
            `expire_in:
          type: number`,
            `token_type:
          type: string`,
        ],
    },
    {
        name: 'version.list',
        title: 'The list of dataset versions',
        description: 'The list of dataset versions',
        type: 'array',
        items: `type: string`,
    },
] as FixedSchema[];
