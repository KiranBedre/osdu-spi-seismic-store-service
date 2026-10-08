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

//data definition exports go here
//information that must be hard coded or hand updated

export const legal = `
#  ***************************************************************************
#  Copyright 2017 - 2023, Schlumberger
#
#  Licensed under the Apache License, Version 2.0(the 'License');
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an 'AS IS' BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#  ***************************************************************************
`;

export const serviceInfo = `
openapi: 3.0.2

info:
  title: Seismic DDMS V4
  description: Seismic Domain Data Management APIs to store and manage strongly typed seismic datasets.
  version: 4.0.0
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html

servers:
  - url: "#{servers.url}#"
`;

export const statusPaths = `
paths:
  ### ==============================================================================
  ### STATUS PATHS
  ### ==============================================================================

  /status:
    get:
      summary: "SDDMS service status"
      description: "This api returns the service status"
      operationId: service-status
      tags:
        - Service Status
      responses:
        200:
          $ref: "#/components/responses/service.status"

  /status/readiness:
    get:
      summary: "SDDMS service status readiness"
      description: "This api returns the service ready status"
      operationId: service-status-readiness
      tags:
        - Service Status
      responses:
        200:
          $ref: "#/components/responses/service.status.ready"
`;
export const infoPaths = `
  ### ==============================================================================
  ### INFO PATHS
  ### ==============================================================================

  /info:
    get:
      summary: "SDDMS service info"
      description: "This api returns the service info"
      operationId: service-info
      tags:
        - Service Info
      responses:
        200:
          $ref: "#/components/responses/service.info"
`;
export const connectionStrings = ` 
  ### ==============================================================================
  ### CONNECTION STRINGS
  ### ==============================================================================

  /connection-string/upload/record/{id}:
    get:
      operationId: connection-string-upload-record
      summary: get the dataset upload connection strings
      description: |
        Required role: dataset.owner

        This api returns the connection string to upload a dataset.
      tags:
        - Storage Connection Strings
      parameters:
        - $ref: "#/components/parameters/data.partition.id"
        - $ref: "#/components/parameters/id"
      responses:
        200:
          $ref: "#/components/responses/connection.string"

  /connection-string/download/record/{id}:
    get:
      operationId: connection-string-download-record
      summary: get the dataset download connection strings
      description: |
        Required role: dataset.viewer or dataset.owner

        This api returns the connection string to download a dataset.
      tags:
        - Storage Connection Strings
      parameters:
        - $ref: "#/components/parameters/data.partition.id"
        - $ref: "#/components/parameters/id"
      responses:
        200:
          $ref: "#/components/responses/connection.string"
`;

export const connectionStringExample = `connection.string:
        summary: connection string
        value:
          {
            access_token: "string",
            expire_in: 3600,
            token_type: "Bearer",
          }
`;

export const fileEnd = ` 
    version.list:
      description: The list of dataset versions
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/version.list"
          examples:
            version.list:
              $ref: "#/components/examples/version.list"              
    connection.string:
      description: The dataset files connection string
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/connection.string"
          examples:
            connection.string:
              $ref: "#/components/examples/connection.string"

  securitySchemes: # define the security scheme type (HTTP bearer)
    bearerAuth: # arbitrary name for the security scheme
      type: http
      scheme: bearer
      bearerFormat: JWT # optional, arbitrary value for documentation purposes

security: #  apply the security globally to all operations
  - bearerAuth: []
`;
export const fixedResponses = `
    service.status:
      description: The service status
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/service.status"
          examples:
            service.status:
              $ref: "#/components/examples/service.status"
    service.status.ready:
      description: The service readiness status
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/service.status.ready"
          examples:
            service.status.ready:
              $ref: "#/components/examples/service.status.ready"
    service.info:
      description: The service info
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/service.info"
          examples:
            service.info:
              $ref: "#/components/examples/service.info"
    record.id.list:
      description: The list of datasets record ID
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/record.id.list"
          examples:
            record.id.list:
              $ref: "#/components/examples/record.id.list"
    record.id.version.list:
      description: The list of versioned datasets record ID
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/record.id.version.list"
          examples:
            record.id.version.list:
              $ref: "#/components/examples/record.id.version.list"`;
