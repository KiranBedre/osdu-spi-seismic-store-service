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

import { TestSchema, TestSchemaArgs } from './schema';
import { Config } from './shared/config';
import { TestStatus } from './status';

const testSchemasArgs = [
    {
        endpoint: 'segy',
        tag: 'SEGY',
        model: 'FileCollection.SEGY.1.0.0.json',
        hasBulk: true,
    },
    {
        endpoint: 'openzgy',
        tag: 'OpenZGY',
        model: 'FileCollection.Slb.OpenZGY.1.0.0.json',
        hasBulk: true,
    },
    {
        endpoint: 'openvds',
        tag: 'OpenVDS',
        model: 'FileCollection.Bluware.OpenVDS.1.0.0.json',
        hasBulk: true,
    },
    {
        endpoint: 'generic',
        tag: 'Generic',
        model: 'FileCollection.Generic.1.0.0.json',
        hasBulk: true,
    },
    {
        endpoint: 'tracedata',
        tag: 'Trace Data',
        model: 'SeismicTraceData.1.3.0.json',
    },
    {
        endpoint: 'bingrid',
        tag: 'Bin Grid',
        model: 'SeismicBinGrid.1.0.0.json',
    },
    {
        endpoint: 'linegeometry',
        tag: 'Line Geometry',
        model: 'SeismicLineGeometry.1.0.0.json',
    },

    {
        endpoint: '2dinterpretationset',
        tag: '2D Interpretation Set',
        model: 'Seismic2DInterpretationSet.1.1.0.json',
    },

    {
        endpoint: '3dinterpretationset',
        tag: '3D Interpretation Set',
        model: 'Seismic3DInterpretationSet.1.1.0.json',
    },
    {
        endpoint: 'acquisitionsurvey',
        tag: 'Acquisition Survey',
        model: 'SeismicAcquisitionSurvey.1.2.0.json',
    },
    {
        endpoint: 'processingproject',
        tag: 'Processing Project',
        model: 'SeismicProcessingProject.1.2.0.json',
    },
    {
        endpoint: 'seismichorizon',
        tag: 'Seismic Horizon',
        model: 'SeismicHorizon.1.2.0.json',
    },
] as TestSchemaArgs[];

class Test {
    public static async run() {
        // load initial configurations from env
        Config.load();
        // check if the service is up and running
        new TestStatus().run();
        // execute tests for each schema
        for (const arg of testSchemasArgs) {
            await new TestSchema().run(arg);
        }
    }
}

Test.run().catch((error) => {
    console.log(error);
});
