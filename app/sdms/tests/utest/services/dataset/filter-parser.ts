// ============================================================================
// Copyright 2023, Microsoft
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

import { Tx } from '../../utils';
import { AndQueryFilter, MatchQueryFilter, NotQueryFilter, OrQueryFilter } from '../../../../src/services/dataset';
import { DatasetFilterParser } from '../../../../src/services/dataset/filter-parser';
import { expect } from 'chai';
import { Error } from '../../../../src/shared';

export class FilterParserTest {

    public static run() {

        describe(Tx.testInit('Dataset/FilterParser'), () => {

            this.parseFilterTest();

        });
    };

    private static parseFilterTest() {

        Tx.sectionInit('DatasetFilterParser parseFilter');

        Tx.test(() => {
            const input = {
                'property': 'name',
                'operator': 'LIKE',
                'value': 'test.%'
            };
            const filter = DatasetFilterParser.parseFilter(input);
            Tx.checkTrue(filter instanceof MatchQueryFilter);
            const matchFilter1 = filter as MatchQueryFilter;
            Tx.checkTrue(matchFilter1.property === 'name');
            Tx.checkTrue(matchFilter1.operator === 'LIKE');
            Tx.checkTrue(matchFilter1.value === 'test.%');
            Tx.checkTrue(matchFilter1.type === 'STRING');
        });

        Tx.test(() => {
            const input = {
                'property': 'sbit_count',
                'operator': '=',
                'value': 0
            };
            const filter = DatasetFilterParser.parseFilter(input);
            Tx.checkTrue(filter instanceof MatchQueryFilter);
            const matchFilter1 = filter as MatchQueryFilter;
            Tx.checkTrue(matchFilter1.property === 'sbit_count');
            Tx.checkTrue(matchFilter1.operator === '=');
            Tx.checkTrue(matchFilter1.value === 0);
            Tx.checkTrue(matchFilter1.type === 'NUMBER');
        });

        Tx.test(() => {
            const input = {
                'not':
                    {
                        'property': 'name',
                        'operator': 'LIKE',
                        'value': 'test.%'
                    }
            };
            const filter = DatasetFilterParser.parseFilter(input);
            Tx.checkTrue(filter instanceof NotQueryFilter);
            const notFilter = filter as NotQueryFilter;
            Tx.checkTrue(notFilter.filter instanceof MatchQueryFilter);
            const matchFilter = notFilter.filter as MatchQueryFilter;
            Tx.checkTrue(matchFilter.property === 'name');
            Tx.checkTrue(matchFilter.operator === 'LIKE');
            Tx.checkTrue(matchFilter.value === 'test.%');
            Tx.checkTrue(matchFilter.type === 'STRING');
        });


        Tx.test(() => {
            const input = {
                'and': [
                    {
                        'property': 'name',
                        'operator': 'LIKE',
                        'value': 'test.%'
                    },
                    {
                        'property': 'readonly',
                        'operator': '=',
                        'value': true
                    },
                    // list of operators is implementation dependent,
                    // operators might also not require a value
                    {
                        'property': 'arbitrary property',
                        'operator': 'FOOBAR'
                    },
                    {
                        'not': {
                          'property': 'aProperty',
                          'operator': 'anOperator',
                          'value': 'aValue'
                        }
                    }
                ]
            };
            const filter = DatasetFilterParser.parseFilter(input);
            Tx.checkTrue(filter instanceof AndQueryFilter);
            const andFilter = filter as AndQueryFilter;
            Tx.checkTrue(andFilter.filters.length === 4);

            Tx.checkTrue(andFilter.filters[0] instanceof MatchQueryFilter);
            const matchFilter1 = andFilter.filters[0] as MatchQueryFilter;
            Tx.checkTrue(matchFilter1.property === 'name');
            Tx.checkTrue(matchFilter1.operator === 'LIKE');
            Tx.checkTrue(matchFilter1.value === 'test.%');
            Tx.checkTrue(matchFilter1.type === 'STRING');
            Tx.checkTrue(andFilter.filters[1] instanceof MatchQueryFilter);

            const matchFilter2 = andFilter.filters[1] as MatchQueryFilter;
            Tx.checkTrue(matchFilter2.property === 'readonly');
            Tx.checkTrue(matchFilter2.operator === '=');
            Tx.checkTrue(matchFilter2.value === true);
            Tx.checkTrue(matchFilter2.type === 'BOOLEAN');

            const matchFilter3 = andFilter.filters[2] as MatchQueryFilter;
            Tx.checkTrue(matchFilter3.property === 'arbitrary property');
            Tx.checkTrue(matchFilter3.operator === 'FOOBAR');
            Tx.checkTrue(matchFilter3.value === undefined);
            Tx.checkTrue(matchFilter3.type === 'STRING');

            Tx.checkTrue(andFilter.filters[3] instanceof NotQueryFilter);
            const notFilter4 = andFilter.filters[3] as NotQueryFilter;
            Tx.checkTrue(notFilter4.filter instanceof MatchQueryFilter);
            const matchFilter4 = notFilter4.filter as MatchQueryFilter;
            Tx.checkTrue(matchFilter4.property === 'aProperty');
            Tx.checkTrue(matchFilter4.operator === 'anOperator');
            Tx.checkTrue(matchFilter4.value === 'aValue');
            Tx.checkTrue(matchFilter4.type === 'STRING');
        });

        Tx.test(() => {
            const input = {
                'and': [
                    {
                        'property': 'name',
                        'operator': 'LIKE',
                        'value': 'test.%'
                    },
                    {
                        'and': [
                            {
                                'property': 'readonly',
                                'operator': '=',
                                'value': true
                            },
                            {
                                'property': 'seismicmeta_guid',
                                'operator': '=',
                                'value': 'slb:seismic:1234abcd5678efgh'
                            }
                        ]
                    }
                ]
            };
            const filter = DatasetFilterParser.parseFilter(input);
            Tx.checkTrue(filter instanceof AndQueryFilter);
            const andFilter = filter as AndQueryFilter;
            Tx.checkTrue(andFilter.filters.length === 2);
            Tx.checkTrue(andFilter.filters[0] instanceof MatchQueryFilter);
            const matchFilter1 = andFilter.filters[0] as MatchQueryFilter;
            Tx.checkTrue(matchFilter1.property === 'name');
            Tx.checkTrue(andFilter.filters[1] instanceof AndQueryFilter);
            const matchFilter2 = andFilter.filters[1] as AndQueryFilter;
            Tx.checkTrue(matchFilter2.filters.length === 2);
            Tx.checkTrue(matchFilter2.filters[0] instanceof MatchQueryFilter);
            const filter2part1 = matchFilter2.filters[0] as MatchQueryFilter;
            Tx.checkTrue(filter2part1.property === 'readonly');
            Tx.checkTrue(matchFilter2.filters[1] instanceof MatchQueryFilter);
            const filter2part2 = matchFilter2.filters[1] as MatchQueryFilter;
            Tx.checkTrue(filter2part2.property === 'seismicmeta_guid');
        });

        Tx.test(() => {
            const input = {
                'and': [
                    {
                        'or': [
                            {
                                'property': 'gtags',
                                'operator': 'CONTAINS',
                                'value': 'tagA'
                            },
                            {
                                'property': 'gtags',
                                'operator': 'CONTAINS',
                                'value': 'tagC'
                            }
                        ]
                    },
                    {
                        'property': 'name',
                        'operator': 'LIKE',
                        'value': 'W%'
                    },
                    {
                        'not': {
                            'property': 'gtags',
                            'operator': 'CONTAINS',
                            'value': 'tagB'
                        }
                    }
                ]
            };
            const filter = DatasetFilterParser.parseFilter(input);
            Tx.checkTrue(filter instanceof AndQueryFilter);
            const andFilter = filter as AndQueryFilter;
            Tx.checkTrue(andFilter.filters.length === 3);
            Tx.checkTrue(andFilter.filters[0] instanceof OrQueryFilter);
            const orFilter1 = andFilter.filters[0] as OrQueryFilter;
            Tx.checkTrue(orFilter1.filters.length === 2);
            Tx.checkTrue(orFilter1.filters[0] instanceof MatchQueryFilter);
            const matchFilter1 = orFilter1.filters[0] as MatchQueryFilter;
            Tx.checkTrue(matchFilter1.property === 'gtags');
            Tx.checkTrue(matchFilter1.operator === 'CONTAINS');
            Tx.checkTrue(matchFilter1.value === 'tagA');
            Tx.checkTrue(orFilter1.filters[1] instanceof MatchQueryFilter);
            const matchFilter2 = orFilter1.filters[1] as MatchQueryFilter;
            Tx.checkTrue(matchFilter2.property === 'gtags');
            Tx.checkTrue(matchFilter2.operator === 'CONTAINS');
            Tx.checkTrue(matchFilter2.value === 'tagC');
            Tx.checkTrue(andFilter.filters[1] instanceof MatchQueryFilter);
            const matchFilter3 = andFilter.filters[1] as MatchQueryFilter;
            Tx.checkTrue(matchFilter3.property === 'name');
            Tx.checkTrue(matchFilter3.operator === 'LIKE');
            Tx.checkTrue(matchFilter3.value === 'W%');
            Tx.checkTrue(andFilter.filters[2] instanceof NotQueryFilter);
            const notFilter4 = andFilter.filters[2] as NotQueryFilter;
            Tx.checkTrue(notFilter4.filter instanceof MatchQueryFilter);
            const matchFilter4 = notFilter4.filter as MatchQueryFilter;
            Tx.checkTrue(matchFilter4.property === 'gtags');
            Tx.checkTrue(matchFilter4.operator === 'CONTAINS');
            Tx.checkTrue(matchFilter4.value === 'tagB');
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Filter list missing/, {
                'and': []
            });
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Filter list missing/, {
                'or': []
            });
        });


        Tx.test(() => {
            this.expectBadRequestFor(/Filter property missing/, {
                'operator': 'LIKE',
                'value': 'test.%'
            });
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Filter operator missing/, {
                'property': 'name',
                'value': 'test.%'
            });
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Filter list missing/, {
                'and': {
                    'property': 'readonly',
                    'operator': '=',
                    'value': true
                }
            });
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Unexpected filter property/, {
                'property': 'name',
                'and': [
                    {
                        'property': 'readonly',
                        'operator': '=',
                        'value': true
                    },
                    {
                        'property': 'seismicmeta_guid',
                        'operator': '=',
                        'value': 'slb:seismic:1234abcd5678efgh'
                    }
                ]
            });
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Filter property missing/, {
                'not': {}
            });
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Unexpected filter property/, {
                'property': 'name',
                'not': [
                    {
                        'property': 'readonly',
                        'operator': '=',
                        'value': true
                    },
                    {
                        'property': 'seismicmeta_guid',
                        'operator': '=',
                        'value': 'slb:seismic:1234abcd5678efgh'
                    }
                ]
            });
        });

        Tx.test(() => {
            this.expectBadRequestFor(/Unexpected filter property/, {
                'property': 'name',
                'or': [
                    {
                        'property': 'readonly',
                        'operator': '=',
                        'value': true
                    },
                    {
                        'property': 'seismicmeta_guid',
                        'operator': '=',
                        'value': 'slb:seismic:1234abcd5678efgh'
                    }
                ]
            });
        });

    };

    private static expectBadRequestFor(regExp: RegExp, input: any) {
        const expectError = expect(() => DatasetFilterParser.parseFilter(input))
            .to.throw()
            .with.property('error');
        expectError.to.have.property('code', Error.Status.BAD_REQUEST);
        expectError.to.have.property('message').match(regExp);
    }
}
