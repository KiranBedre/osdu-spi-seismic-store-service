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

import Collection, { GeneratePage } from './handler';
import {
    connectionStringExample,
    connectionStrings,
    fileEnd,
    fixedResponses,
    legal,
    serviceInfo,
    statusPaths,
    infoPaths,
} from '.';
import fs from 'fs';
import path from 'path';

//call generation (handler) and outputs the fully generated page

export const OutputPage = (filename: string) => {
    GeneratePage();

    const pageData = `
${legal}

${serviceInfo}

${statusPaths}

${infoPaths}

${Collection[0]}

${connectionStrings}

components:
  parameters: ${Collection[1]}
  schemas: ${Collection[2]}
    ${Collection[3]}
  examples: ${Collection[4]}
    ${Collection[5]}
    ${connectionStringExample}
  requestBodies:
    ${Collection[6]}
  responses:
    ${fixedResponses}
    ${Collection[7]}
    ${Collection[8]}
    ${fileEnd}
`;
    fs.writeFileSync(path.join(__dirname, filename), pageData);
};
