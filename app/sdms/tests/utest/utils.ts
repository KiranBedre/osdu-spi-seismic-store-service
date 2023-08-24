// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { expect } from 'chai';
import { Request as expRequest, Response as expResponse } from 'express';

class MockExpressResponse {
    public statusCode: number;
    public data: any;
    public locals: any = {
        trace: {
            flush: () => undefined,
            start: (msg: string) => undefined,
            stop: () => undefined,
        },
    };
    public send(data: any) { this.data = data; }
    public status(code: number) { this.statusCode = code; return { send: this.send }; }
    public set(data: any) { return this; }
    public get(data: any) { return ''; }
}

class MockExpressRequest {
    public query = {};
    public headers = {};
    public params = {};
    public body = {};
}

export class Tx {

    public static getReq(tenant = 't', subproject = 'spx01', path = 'p', dataset = 'd', authorization = 'a') {
        const expReq = (new MockExpressRequest() as unknown) as expRequest;
        expReq.params.tenantid = tenant; expReq.params.subprojectid = subproject;
        expReq.query.path = path; expReq.params.datasetid = dataset;
        expReq.headers.authorization = 'header.' + Buffer.from(
            JSON.stringify({ email: 'user@user.com' })).toString('base64') + '.signature';
        expReq.body = {};
        expReq.get = (param: any) => param
        return expReq;
    }

    public static getRes() {
        return (new MockExpressResponse() as unknown) as expResponse;
    }

    public static sectionInit(title: string) {
        this.sectionCount = 0;
        this.sectionTitle = title;
    }

    public static testInit(mex: string, nl: boolean = false): string {
        this.sectionCount = 0;
        return '\n  [ ' + mex.toUpperCase() + ' ]\n';
    }

    public static title(mex: string): string {
        return '=============================== ' +
            mex.toUpperCase() +
            ' ===============================';
    }

    public static test(cb: any) {
        it(this.getTag(), (done) => {
            cb(done)
                .catch(done);  // interpret exceptions as test failures
        });
    }

    public static testExp(cb: any) {
        it(this.getTag(), (done) => { cb(done, this.getReq(), this.getRes()); });
    }

    public static check200(val: number, done: any) { this.check(val, 200, done); }
    public static check202(val: number, done: any) { this.check(val, 202, done); }
    public static check400(val: number, done: any) { this.check(val, 400, done); }
    public static check403(val: number, done: any) { this.check(val, 403, done); }
    public static check404(val: number, done: any) { this.check(val, 404, done); }
    public static check409(val: number, done: any) { this.check(val, 409, done); }
    public static check423(val: number, done: any) { this.check(val, 423, done); }
    public static check500(val: number, done: any) { this.check(val, 500, done); }
    public static check501(val: number, done: any) { this.check(val, 501, done); }
    public static checkTrue(val: boolean, done: any) { this.check(val, true, done); }
    public static checkFalse(val: boolean, done: any) { this.check(val, false, done); }

    private static sectionCount = 0;
    private static sectionTitle = '';

    private static getSectionPrefix(): string {
        return '[' + (this.sectionCount < 10 ? '0' : '') + this.sectionCount + ']';
    }

    private static getTag(): string {
        this.sectionCount += 1;
        return this.getSectionPrefix() + ' ' + this.sectionTitle;
    }

    private static check(val: any, check: any, done: any) {
        expect(val).to.be.equal(check); done();
    }

}
