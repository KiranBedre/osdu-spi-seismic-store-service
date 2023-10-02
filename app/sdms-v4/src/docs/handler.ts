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

//processes schema data in conjunction with parser
//retrieve individual endpoint data from parser and construct yaml file

import {
    bodyGeneration,
    exampleGeneration,
    fixedComponents,
    fixedExamples,
    fixedSchemas,
    paginatedExampleGeneration,
    paginationGeneration,
    pathGeneration,
    responseGeneration,
    schemaGeneration,
} from './parser';
import { Definition } from './operation';
import { SchemaEndpoints } from '../apis/schema/types';

const PathCollection = [];
const ComponentCollection = [];
const SchemaCollection = [];
const PaginationCollection = [];
const ExampleCollection = [];
const PaginatedExampleCollection = [];
const BodyCollection = [];
const ResponseCollection = [];
const PaginatedResponseCollection = [];
const Collection = [];

export const GeneratePage = () => {
    //generates generic azure info
    SchemaCollection.push(fixedSchemas().join(''));
    ComponentCollection.push(fixedComponents().join(''));
    ExampleCollection.push(fixedExamples().join(''));

    //generates necessary information for each endpoint
    SchemaEndpoints.forEach(endpoint => {
        PathCollection.push(pathGeneration(endpoint));
        SchemaCollection.push(schemaGeneration(endpoint));
        PaginationCollection.push(paginationGeneration(endpoint));
        ExampleCollection.push(exampleGeneration(endpoint));
        PaginatedExampleCollection.push(paginatedExampleGeneration(endpoint));
        BodyCollection.push(bodyGeneration(endpoint));
        ResponseCollection.push(responseGeneration(endpoint, Definition.Base));
        PaginatedResponseCollection.push(responseGeneration(endpoint, Definition.Paginated));
    });

    //places each section of the document into the collection array
    Collection.push(PathCollection.join(''));
    Collection.push(ComponentCollection.join(''));
    Collection.push(SchemaCollection.join(''));
    Collection.push(PaginationCollection.join(''));
    Collection.push(ExampleCollection.join(''));
    Collection.push(PaginatedExampleCollection.join(''));
    Collection.push(BodyCollection.join(''));
    Collection.push(ResponseCollection.join(''));
    Collection.push(PaginatedResponseCollection.join(''));
};

export default Collection;
