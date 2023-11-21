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

import sinon from 'sinon';
import { expect } from 'chai';
import { Request as expRequest, Response as expResponse } from 'express';
import { Config } from '../../../../src/cloud';
import { DatasetParser } from '../../../../src/services/dataset/parser';
import { Tx } from '../../utils';
import { QueryFilter, QueryFilterVisitor } from '../../../../src/services/dataset';
import { DatasetFilterParser } from '../../../../src/services/dataset/filter-parser';

export class ParserTest {

    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit("Dataset/Parser"), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
            });
            afterEach(() => {
                this.sandbox.restore();
            });

            this.listFilterTest();

        } );
    };

    private static listFilterTest() {

        Tx.sectionInit("DatasetParser list filter");

        class StubFilter implements QueryFilter {
            public accept(_: QueryFilterVisitor): void {
                throw new Error('Function not implemented.'); // never called
            }

        }

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'POST';
            let request = DatasetParser.list(expReq);
            Tx.checkTrue(request.filter === undefined);
        });

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'POST';
            expReq.body.limit = '-1';
            let request = DatasetParser.list(expReq);
            Tx.checkTrue(request.pagination.limit === -1);
        });

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'POST';
            expReq.body.limit = '-2';
            expect(() => DatasetParser.list(expReq))
                .to.throw()
                .with.property('error')
                .that.has.property('message')
                .that.contains('The \'limit\' input param cannot be less than zero.');
        });

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'POST';
            let filter = new StubFilter();
            this.sandbox.stub(DatasetFilterParser, 'parseFilter').returns(filter);
            expReq.body.filter = new Object();
            let request = DatasetParser.list(expReq);
            Tx.checkTrue(request.filter === filter);
        });

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', false);
            expReq.method = 'POST';
            expReq.body.filter = new Object();
            expect(() => DatasetParser.list(expReq))
                .to.throw()
                .with.property('error')
                .that.has.property('message')
                .that.contains('The \'filter\' parameter is not supported');
        });


        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'POST';
            expReq.body.gtags = ['tag1'];
            let request = DatasetParser.list(expReq);
            Tx.checkTrue(request.dataset.gtags == expReq.body.gtags);
        });

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'POST';
            // legacy reasons
            expReq.body.gtag = ['tag1'];
            let request = DatasetParser.list(expReq);
            Tx.checkTrue(request.dataset.gtags == expReq.body.gtag);
        });

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'GET';
            expReq.query.gtags = ['tag1'];
            let request = DatasetParser.list(expReq);
            Tx.checkTrue(request.dataset.gtags == expReq.query.gtags);
        });

        Tx.testExp((expReq: expRequest, expRes: expResponse) => {
            this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            expReq.method = 'GET';
            //legacy reasons
            expReq.query.gtag = ['tag1'];
            let request = DatasetParser.list(expReq);
            Tx.checkTrue(request.dataset.gtags == expReq.query.gtag);
        });
    };
}
