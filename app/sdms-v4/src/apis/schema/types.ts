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

export interface SchemaEndpoint {
    name: string;
    kind: string;
    docDataType: string;
    hasBulks?: boolean;
    idPattern: string;
    docBulkExtension?: string;
}

export const SchemaEndpoints = [
    {
        name: 'segy',
        kind: 'osdu:wks:dataset--FileCollection.SEGY:1.0.0',
        docDataType: 'SEGY',
        hasBulks: true,
        idPattern: '^[\\w\\-\\.]+:dataset\\-\\-FileCollection.SEGY:[\\w\\-\\.\\:\\%]+$',
        docBulkExtension: 'sgy',
    },
    {
        name: 'openzgy',
        kind: 'osdu:wks:dataset--FileCollection.Slb.OpenZGY:1.0.0',
        docDataType: 'OpenZGY',
        hasBulks: true,
        idPattern: '^[\\w\\-\\.]+:dataset\\-\\-FileCollection.Slb.OpenZGY:[\\w\\-\\.\\:\\%]+$',
        docBulkExtension: 'zgy',
    },
    {
        name: 'openvds',
        kind: 'osdu:wks:dataset--FileCollection.Bluware.OpenVDS:1.0.0',
        docDataType: 'OpenVDS',
        hasBulks: true,
        idPattern: '^[\\w\\-\\.]+:dataset\\-\\-FileCollection.Bluware.OpenVDS:[\\w\\-\\.\\:\\%]+$',
        docBulkExtension: 'vds',
    },
    {
        name: 'generic',
        kind: 'osdu:wks:dataset--FileCollection.Generic:1.0.0',
        docDataType: 'Generic',
        idPattern: '^[\\w\\-\\.]+:dataset\\-\\-FileCollection.Generic:[\\w\\-\\.\\:\\%]+$',
        hasBulks: true,
    },
    {
        name: '2dinterpretationset',
        kind: 'osdu:wks:master-data--Seismic2DInterpretationSet:1.1.0',
        docDataType: '2D Interpretation Set',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:master-data\\-\\-Seismic2DInterpretationSet:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: '3dinterpretationset',
        kind: 'osdu:wks:master-data--Seismic3DInterpretationSet:1.1.0',
        docDataType: '3D Interpretation Set',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:master-data\\-\\-Seismic3DInterpretationSet:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'acquisitionsurvey',
        kind: 'osdu:wks:master-data--SeismicAcquisitionSurvey:1.2.0',
        docDataType: 'Acquisition Survery',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:master-data\\-\\-SeismicAcquisitionSurvey:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'processingproject',
        kind: 'osdu:wks:master-data--SeismicProcessingProject:1.2.0',
        docDataType: 'Processing Project',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:master-data\\-\\-SeismicProcessingProject:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'bingrid',
        kind: 'osdu:wks:work-product-component--SeismicBinGrid:1.0.0',
        docDataType: 'Bin Grid',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:work-product-component\\-\\-SeismicBinGrid:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'linegeometry',
        kind: 'osdu:wks:work-product-component--SeismicLineGeometry:1.0.0',
        docDataType: 'Line Geometry',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:work-product-component\\-\\-SeismicLineGeometry:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'horizon',
        kind: 'osdu:wks:work-product-component--SeismicHorizon:1.2.0',
        docDataType: 'Horizon',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:work-product-component\\-\\-SeismicHorizon:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'tracedata',
        kind: 'osdu:wks:work-product-component--SeismicTraceData:1.3.0',
        docDataType: 'Trace Data',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:work-product-component\\-\\-SeismicTraceData:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'notionalseismicline',
        kind: 'osdu:wks:work-product-component--NotionalSeismicLine:1.1.0',
        docDataType: 'Notional Seismic Line',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:work-product-component\\-\\-NotionalSeismicLine:[\\w\\-\\.\\:\\%]+$',
    },
    {
        name: 'fault',
        kind: 'osdu:wks:work-product-component--SeismicFault:1.2.0',
        docDataType: 'Seismic Fault',
        hasBulks: false,
        idPattern: '^[\\w\\-\\.]+:work-product-component\\-\\-SeismicFault:[\\w\\-\\.\\:\\%]+$',
    },
] as SchemaEndpoint[];
