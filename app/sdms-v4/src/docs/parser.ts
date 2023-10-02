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

// receives info from handler
// creates page data for all shared functions
// if hasBulks, creates extra page data for those functions
// returns each piece to handler

import { Definition, Operation } from './operation';
import { SchemaCollections, SchemaComponents, SchemaExamples, pathHeader, toTitleCase } from './schema';
import { SchemaEndpoint } from '../apis/schema/types';
// generates a specific endpoint
const endpointGeneration = (operation: Operation, schema: SchemaEndpoint) => {
    const group = schema.kind.split(':')[2].split('--')[0].replace(/-/gi, ' ');
    const dataReference = schema.kind.split('--')[1].split(':')[0];
    const version = schema.kind.split('--')[1].split(':')[1];
    let endpointURL = '';
    let operationId;
    let request = 'get';
    let descriptionString: string;
    let sharedDescription: string;
    const baseUrl = `https://community.opengroup.org/osdu/data/data-definitions/-/blob/master/Generated/${group.replace(
        /\s+/g,
        '-'
    )}/${dataReference}.${version}.json`;
    const adminRole = 'users.datalake.admin';
    const editorRole = 'users.datalake.editors';
    const viewerRole = 'users.datalake.viewers';
    let requiredRoles;
    let operationDefinitions;
    let type = 'component';
    // add function that camel case
    let tag = `${toTitleCase(group)} ${schema.docDataType}`;
    if (schema.hasBulks) {
        type = 'dataset';
        tag = `File Collection ${schema.docDataType}`;
    }

    if (operation === 0) {
        endpointURL = `/${schema.name}/v1:`;
        operationId = `operationId: ${schema.name}-v1-insert`;
        request = 'put';
        requiredRoles = `Required role: ${editorRole} or ${adminRole}`;

        sharedDescription = `  description: |
        ${requiredRoles}
        
        This API registers or updates a list of ${schema.docDataType} seismic ${type}. When a ${type} is updated, a new version of it will be created.
        The [${schema.docDataType} ${version}](${baseUrl}) data representation is defined by the OSDU authority and is required as a body parameter in this request.`;

        operationDefinitions = `parameters:
        - $ref: "#/components/parameters/data.partition.id"
      requestBody:
        $ref: "#/components/requestBodies/${schema.name}.${version}.list"
      responses:
        200:
          $ref: "#/components/responses/record.id.version.list"`;

        if (schema.hasBulks) {
            let dataArray;
            if (schema.docBulkExtension) {
                dataArray = `"data": {
            "DatasetProperties": {
              "FileCollectionPath": "${schema.name}-dataset"
              "FileSourceInfos": [
                { "FileSource": "data.01.${schema.docBulkExtension}" },
                { "FileSource": "data.02.${schema.docBulkExtension}" } 
              ]
            }
          }`;
            } else {
                dataArray = `"data": {
            "DatasetProperties": {
              "FileCollectionPath": "vds-dataset"
              "FileSourceInfos": [
                { "FileSource": "data.01" },
                { "FileSource": "data.02" } 
              ]
            }
          }`;
            }

            descriptionString = `summary: register or update ${schema.docDataType} seismic datasets
    ${sharedDescription}
        
        Reference to bulk files, composing the dataset, can be specified in the 
        *DatasetProperties* property of the model.
        
        **example: dataset collection and files** 
        \`\`\`   
        ${dataArray}
        \`\`\`
        The Access Control is applied at the dataset level and regulates access to bulks/files resources. 
        It is performed by checking if the caller is a member of an authorization group. 
        A user in SDMS can be either owner or viewer
        -  owner with read/write access if a member of an owner authorization group
        -  viewer with read-only access if a member of a viewer authorization group.
        The owner and viewer authorization groups are required to be specified in the *acl* property of the model.

        **example: access control list definition**
        \`\`\`
        "acl": {
          "owners": [
            "someone.owner@comany.com"
          ]
          "viewers": [
            "someone.viewer@comany.com"
          ]
        }
        \`\`\`     
          
        Each seismic dataset has associated legal tag information. 
        The legal tag is always checked by SDDMS before it releases any sensitive information of a dataset.
        The legal tag is required to be specified in the *legal* property of the model.
          
        **example: legal tag definition**
        \`\`\`
          "legal": {
            "legaltags": [
              "an.example.legal.tag"
            ],
            "otherRelevantDataCountries": [
              "US"
            ]
            "status": "compliant"
          }
        \`\`\`      
        
        The API returns a list of versioned records ID for the registered or updated datasets.
      tags:
        - ${tag}
      ${operationDefinitions}`;
        } else {
            descriptionString = `summary: register or update ${schema.docDataType} seismic components
    ${sharedDescription}
        References to datasets, as record id, can be specified in the
        *Dataset* property of the model. These referenced datasets must exist in SDDMS.
        
        The API returns a list of versioned records ID for the registered or updated datasets.
      tags:
        - ${tag}
      ${operationDefinitions}`;
        }
    } else if (operation === 1) {
        endpointURL = `/${schema.name}/v1/list:`;
        operationId = `operationId: ${schema.name}-v1-list`;
        operationDefinitions = `parameters:
        - $ref: "#/components/parameters/data.partition.id"
        - $ref: "#/components/parameters/pagination.limit"
        - $ref: "#/components/parameters/pagination.token"
      responses:
        200:
          $ref: "#/components/responses/${schema.name}.${version}.list.paginated"`;

        requiredRoles = `Required role: ${viewerRole} or ${editorRole} or ${adminRole}`;

        sharedDescription = `summary: get the list of ${schema.docDataType} seismic ${type}s
      description: |
        ${requiredRoles}
              
        Returns a list of ${schema.docDataType} seismic ${type}s
              
        Pagination is supported.`;

        descriptionString = `${sharedDescription}
      tags:
        - ${tag}
      ${operationDefinitions}`;
    } else if (operation === 2) {
        endpointURL = `/${schema.name}/v1/record/{id}:`;
        operationId = `operationId: ${schema.name}-v1-get`;
        operationDefinitions = `parameters:
      - $ref: "#/components/parameters/data.partition.id"
      - $ref: "#/components/parameters/id"
      responses:
        200:
          $ref: "#/components/responses/${schema.name}.${version}"`;

        requiredRoles = `Required role: ${viewerRole} or ${editorRole} or ${adminRole}`;

        sharedDescription = `summary: get a ${schema.docDataType} seismic ${type}
      description: |
        ${requiredRoles}

        This API returns the latest version of a ${schema.docDataType} seismic ${type}`;

        descriptionString = `${sharedDescription}
      tags:
        - ${tag}
      ${operationDefinitions}`;
    } else if (operation === 3) {
        request = 'delete';
        operationId = `operationId: ${schema.name}-v1-delete`;
        operationDefinitions = `parameters:
        - $ref: "#/components/parameters/data.partition.id"
        - $ref: "#/components/parameters/id"
      responses:
        200:
          description: The resource was deleted successfully.`;

        requiredRoles = `Required role: ${adminRole}`;

        sharedDescription = `summary: delete a ${schema.docDataType} ${type}
      description: |
        ${requiredRoles}

        The API performs a deletion of the given ${schema.docDataType} seismic ${type}.`;

        descriptionString = `${sharedDescription}
      tags:
        - ${tag}
      ${operationDefinitions}`;
    } else if (operation === 4) {
        endpointURL = `/${schema.name}/v1/record/{id}/versions:`;
        operationId = `operationId: ${schema.name}-v1-get-versions`;
        operationDefinitions = `parameters:
        - $ref: "#/components/parameters/data.partition.id"
        - $ref: "#/components/parameters/id"
      responses:
        200:
          $ref: "#/components/responses/version.list"`;

        requiredRoles = `Required role: ${viewerRole} or ${editorRole} or ${adminRole}`;

        sharedDescription = `summary: get the versions of a ${schema.docDataType} ${type}
      description: |
        ${requiredRoles}
        
        This API returns the list of versions for a ${schema.docDataType} ${type}`;

        descriptionString = `${sharedDescription}
      tags:
        - ${tag}
      ${operationDefinitions}`;
    } else if (operation === 5) {
        endpointURL = `/${schema.name}/v1/record/{id}/version/{version}:`;
        operationId = `operationId: ${schema.name}-v1-get-version`;

        requiredRoles = `Required role: ${viewerRole} or ${editorRole} or ${adminRole}`;
        sharedDescription = `summary: get a version of the ${schema.docDataType} ${type}
      description: |
        ${requiredRoles}
        
        This API returns a specific version of the ${schema.docDataType} seismic ${type}.`;

        operationDefinitions = `parameters:
        - $ref: "#/components/parameters/data.partition.id"
        - $ref: "#/components/parameters/id"
        - $ref: "#/components/parameters/version"
      responses:
        200:
          $ref: "#/components/responses/${schema.name}.${version}"`;

        descriptionString = `${sharedDescription}
      tags:
        - ${tag}
      ${operationDefinitions}`;
    }

    const endpoint = `  
  ${endpointURL}
    ${request}:
      ${operationId}
      ${descriptionString}`;
    return endpoint;
};

// generates all of the paths for an endpoint and returns to handler
export const pathGeneration = (schema: SchemaEndpoint) => {
    const endpointPathCollection = [];
    endpointPathCollection.push(pathHeader(schema.docDataType));
    endpointPathCollection.push(endpointGeneration(Operation.Insert, schema));
    endpointPathCollection.push(endpointGeneration(Operation.List, schema));
    endpointPathCollection.push(endpointGeneration(Operation.Get, schema));
    endpointPathCollection.push(endpointGeneration(Operation.Delete, schema));
    endpointPathCollection.push(endpointGeneration(Operation.GetVersions, schema));
    endpointPathCollection.push(endpointGeneration(Operation.GetVersion, schema));
    return endpointPathCollection.join('');
};

// generates from generic azure info
export const fixedComponents = () => {
    const FixedComponents = [];

    SchemaComponents.forEach(component => {
        let require;
        let length;
        let sharedDescription;
        if (component.required) {
            require = `required: true`;
        }
        if (component.schema.minLength) {
            length = `minLength: ${component.schema.minLength}`;
        }
        if (component.schema.minLength && component.required) {
            sharedDescription = `
    ${component.title}:
      in: ${component.in}
      name: ${component.name}
      description: ${component.description}
      ${require}
      schema:
        title: ${component.schema.title}
        description: ${component.schema.description}
        type: ${component.schema.type}
        ${length}
        example: ${component.schema.example}`;
        } else if (component.schema.minLength) {
            sharedDescription = `
    ${component.title}:
      in: ${component.in}
      name: ${component.name}
      description: ${component.description}
      schema:
        title: ${component.schema.title}
        description: ${component.schema.description}
        type: ${component.schema.type}
        ${length}
        example: ${component.schema.example}`;
        } else if (component.required) {
            sharedDescription = `
    ${component.title}:
      in: ${component.in}
      name: ${component.name}
      description: ${component.description}
      ${require}
      schema:
        title: ${component.schema.title}
        description: ${component.schema.description}
        type: ${component.schema.type}
        example: ${component.schema.example}`;
        } else {
            sharedDescription = `
    ${component.title}:
      in: ${component.in}
      name: ${component.name}
      description: ${component.description}
      schema:
        title: ${component.schema.title}
        description: ${component.schema.description}
        type: ${component.schema.type}
        example: ${component.schema.example}`;
        }
        FixedComponents.push(sharedDescription);
    });
    return FixedComponents;
};

// generates from generic azure info
export const fixedSchemas = () => {
    const FixedSchemas = [];

    SchemaCollections.forEach(fixed => {
        let item = ``;
        if (fixed.items) {
            item = `items:
        ${fixed.items}`;
        }
        if (fixed.properties) {
            item = `properties:`;
            fixed.properties.forEach(property => {
                item += ` 
        ${property}`;
            });
        }
        const sharedDescription = `
    ${fixed.name}:
      title: ${fixed.title}
      description: ${fixed.description}
      type: ${fixed.type}
      ${item}`;
        FixedSchemas.push(sharedDescription);
    });
    return FixedSchemas;
};

// generates list schema for each endpoint
export const schemaGeneration = (schema: SchemaEndpoint) => {
    const group = schema.kind.split(':')[2].split('--')[0].replace(/-/gi, ' ');
    const dataReference = schema.kind.split('--')[1].split(':')[0];
    const version = schema.kind.split('--')[1].split(':')[1];
    let type = 'component';
    if (schema.hasBulks) {
        type = 'dataset';
    }
    const refSchema = `
    ${schema.name}.${version}.list:
      title: ${schema.docDataType} ${version} ${type}s
      description: The list of ${schema.docDataType} ${version} ${type}s
      type: array
      items:
        $ref: https://community.opengroup.org/osdu/data/data-definitions/-/raw/master/Generated/${group.replace(
            /\s+/g,
            '-'
        )}/${dataReference}.${version}.json`;

    return refSchema;
};

// generates pagination schema for each endpoint
export const paginationGeneration = (schema: SchemaEndpoint) => {
    const group = schema.kind.split(':')[2].split('--')[0].replace(/-/gi, ' ');
    const dataReference = schema.kind.split('--')[1].split(':')[0];
    const version = schema.kind.split('--')[1].split(':')[1];
    let type = 'component';
    if (schema.hasBulks) {
        type = 'dataset';
    }
    const paginationSchema = `
    ${schema.name}.${version}.list.paginated:
      title: ${schema.docDataType} ${version} ${type}s paginated list
      description: The paginated list of ${schema.docDataType} ${version} ${type}s
      type: object
      properties:
        datasets:
          type: array
          items:
            $ref: https://community.opengroup.org/osdu/data/data-definitions/-/raw/master/Generated/${group.replace(
                /\s+/g,
                '-'
            )}/${dataReference}.${version}.json
        next-page-token:
          type: string`;
    return paginationSchema;
};

// generates from generic azure info
export const fixedExamples = () => {
    const FixedExamples = [];
    SchemaExamples.forEach(example => {
        const sharedDescription = `
    ${example.title}:
      summary: ${example.summary}
      value: 
        ${example.value}`;
        FixedExamples.push(sharedDescription);
    });
    return FixedExamples;
};

// generates api endpoint example information
export const exampleGeneration = (schema: SchemaEndpoint) => {
    const group = schema.kind.split(':')[2].split('--')[0].replace(/-/gi, ' ');
    const dataReference = schema.kind.split('--')[1].split(':')[0];
    const version = schema.kind.split('--')[1].split(':')[1];
    let type = 'components';
    const baseURL = `https://community.opengroup.org/osdu/data/data-definitions/-/raw/master/Examples/${group.replace(
        /\s+/g,
        '-'
    )}/${dataReference}.${version}.json`;

    if (schema.hasBulks) {
        type = 'datasets';
    }

    const summary = `Seismic ${schema.docDataType} ${version} ${type}`;

    const description = `
    ${schema.name}.${version}.list:
      summary: ${summary}
      value: [$ref: "${baseURL}",]`;
    return description;
};

// generates api endpoint paginated example information
export const paginatedExampleGeneration = (schema: SchemaEndpoint) => {
    const group = schema.kind.split(':')[2].split('--')[0].replace(/-/gi, ' ');
    const dataReference = schema.kind.split('--')[1].split(':')[0];
    const version = schema.kind.split('--')[1].split(':')[1];
    let type = 'components';
    const baseURL = `https://community.opengroup.org/osdu/data/data-definitions/-/raw/master/Examples/${group.replace(
        /\s+/g,
        '-'
    )}/${dataReference}.${version}.json`;

    if (schema.hasBulks) {
        type = 'datasets';
    }

    const summary = `Seismic ${schema.docDataType} ${version} ${type} (paginated)`;

    const description = `
    ${schema.name}.${version}.list.paginated:
      summary: ${summary}
      value: 
        datasets:
          [$ref: "${baseURL}",]
        next-page-token: f446733b-154f-d134-8a54-6ab612a48217`;
    return description;
};

// generates request body for information for an endpoint
export const bodyGeneration = (schema: SchemaEndpoint) => {
    const version = schema.kind.split('--')[1].split(':')[1];
    let type = 'components';
    if (schema.hasBulks) {
        type = 'datasets';
    }
    const title = `${schema.name}.${version}.list`;
    const description = `
    ${title}:
      description: The list of ${schema.docDataType} ${version} ${type}.
      required: true
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/${title}"
          examples:
            ${title}:
              $ref: "#/components/examples/${title}"`;
    return description;
};

// generates response body for list and paginated information for an endpoint
export const responseGeneration = (schema: SchemaEndpoint, step: Definition) => {
    const group = schema.kind.split(':')[2].split('--')[0].replace(/-/gi, ' ');
    const dataReference = schema.kind.split('--')[1].split(':')[0];
    const version = schema.kind.split('--')[1].split(':')[1];
    let description;
    const genURL = `"https://community.opengroup.org/osdu/data/data-definitions/-/raw/master/Generated/${group.replace(
        /\s+/g,
        '-'
    )}/${dataReference}.${version}.json"`;
    const exampleURL = `"https://community.opengroup.org/osdu/data/data-definitions/-/raw/master/Examples/${group.replace(
        /\s+/g,
        '-'
    )}/${dataReference}.${version}.json"`;
    let type = 'component';
    if (schema.hasBulks) {
        type = 'dataset';
    }
    const title = `${schema.name}.${version}`;
    const sharedDescription = `description: The ${schema.docDataType} ${version} ${type}`;

    if (step === 0) {
        description = `
    ${title}:
      ${sharedDescription}
      content:
        application/json:
          schema:
            $ref: ${genURL}
          examples:
            ${schema.docDataType} ${version} dataset:
              $ref: ${exampleURL}`;
    } else if (step === 2) {
        description = `
    ${title}.list.paginated:
      ${sharedDescription} list
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/${title}.list.paginated"
          examples:
            ${title}.list:
              $ref: "#/components/examples/${title}.list.paginated"`;
    }
    return description;
};
