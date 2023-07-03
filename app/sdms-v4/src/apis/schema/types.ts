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

export interface SchemaEndpoint {
    name: string;
    kind: string;
    hasBulks?: boolean;
}

export const SchemaEndpoints = [
    {
        name: 'segy',
        kind: 'osdu:wks:dataset--FileCollection.SEGY:1.0.0',
        hasBulks: true,
    },
    {
        name: 'openzgy',
        kind: 'osdu:wks:dataset--FileCollection.Slb.OpenZGY:1.0.0',
        hasBulks: true,
    },
    {
        name: 'openvds',
        kind: 'osdu:wks:dataset--FileCollection.Bluware.OpenVDS:1.0.0',
        hasBulks: true,
    },
    {
        name: 'generic',
        kind: 'osdu:wks:dataset--FileCollection.Generic:1.0.0',
        hasBulks: true,
    },
    {
        name: '2dinterpretationset',
        kind: 'osdu:wks:master-data--Seismic2DInterpretationSet:1.1.0',
        hasBulks: false,
    },
    {
        name: '3dinterpretationset',
        kind: 'osdu:wks:master-data--Seismic3DInterpretationSet:1.1.0',
        hasBulks: false,
    },
    {
        name: 'acquisitionsurvey',
        kind: 'osdu:wks:master-data--SeismicAcquisitionSurvey:1.2.0',
        hasBulks: false,
    },
    {
        name: 'processingproject',
        kind: 'osdu:wks:master-data--SeismicProcessingProject:1.2.0',
        hasBulks: false,
    },
    {
        name: 'bingrid',
        kind: 'osdu:wks:work-product-component--SeismicBinGrid:1.0.0',
        hasBulks: false,
    },
    {
        name: 'linegeometry',
        kind: 'osdu:wks:work-product-component--SeismicLineGeometry:1.0.0',
        hasBulks: false,
    },
    {
        name: 'seismichorizon',
        kind: 'osdu:wks:work-product-component--SeismicHorizon:1.2.0',
        hasBulks: false,
    },
    {
        name: 'tracedata',
        kind: 'osdu:wks:work-product-component--SeismicTraceData:1.3.0',
        hasBulks: false,
    },
] as SchemaEndpoint[];
