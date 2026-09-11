// Copyright © Amazon Web Services
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
// see the License for the specific language governing permissions and
// limitations under the License.

import { AddressInfo } from 'net';
import { Socket } from 'net';
import { expect } from 'chai';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

import { Utils } from '../../../src/shared/utils';
import { Tx } from '../utils';

// Locks the swagger-resolution hardening that keeps a degraded community.opengroup.org from
// crashlooping the service. The remote data-definitions $refs are still fetched at runtime (behavior
// unchanged), but resolveJsonReferences must (1) tolerate an unresolvable ref rather than throw and
// (2) bound a slow/hanging remote with a timeout so it can never block indefinitely. Combined with
// the resolution being invoked OFF the port-bind path (server-start.ts), this guarantees the
// listener comes up promptly regardless of the remote's health.
export class TestSwaggerResolution {
    public static run() {
        describe(Tx.title('utest seismic store - swagger resolution hardening'), () => {
            let tmpDir: string;

            beforeEach(() => {
                tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdms-v4-utils-'));
            });

            afterEach(() => {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            });

            it('does not throw when a relative $ref cannot be resolved (non-blocking startup)', async () => {
                const doc = path.join(tmpDir, 'openapi.yaml');
                fs.writeFileSync(
                    doc,
                    [
                        'openapi: 3.0.0',
                        'info:',
                        '  title: sdms-v4-test',
                        '  version: 1.0.0',
                        'components:',
                        '  schemas:',
                        '    Missing:',
                        '      $ref: ./data-definitions/Generated/does-not-exist.1.0.0.json',
                    ].join('\n')
                );

                const result: any = await Utils.resolveJsonReferences(doc);
                expect(result).to.be.an('object');
                expect(result.info.title).to.be.equal('sdms-v4-test');
            });

            it('bounds a hanging remote $ref with the timeout and tolerates it', async () => {
                // Simulate a slow/hanging community.opengroup.org: a server that accepts the socket
                // but never responds. Without the timeout this resolution would hang indefinitely -
                // the exact failure that blew the 155s startupProbe in production.
                const sockets = new Set<Socket>();
                const hangingServer = http.createServer(() => {
                    /* deliberately never respond */
                });
                hangingServer.on('connection', socket => {
                    sockets.add(socket);
                    socket.on('close', () => sockets.delete(socket));
                });
                await new Promise<void>(resolve => hangingServer.listen(0, '127.0.0.1', resolve));
                const { port } = hangingServer.address() as AddressInfo;
                const hangingRef = `http://127.0.0.1:${port}/schema.1.0.0.json`;

                const doc = path.join(tmpDir, 'openapi.yaml');
                fs.writeFileSync(
                    doc,
                    [
                        'openapi: 3.0.0',
                        'info:',
                        '  title: sdms-v4-test',
                        '  version: 1.0.0',
                        'components:',
                        '  schemas:',
                        '    Remote:',
                        `      $ref: ${hangingRef}`,
                    ].join('\n')
                );

                const start = Date.now();
                try {
                    const result: any = await Utils.resolveJsonReferences(doc, 500);
                    const elapsed = Date.now() - start;

                    // Tolerated (never threw) and fell back to the raw document.
                    expect(result).to.be.an('object');
                    expect(result.info.title).to.be.equal('sdms-v4-test');
                    // Returned well within any reasonable startupProbe budget despite the hang.
                    expect(elapsed).to.be.lessThan(5000);
                } finally {
                    sockets.forEach(socket => socket.destroy());
                    await new Promise<void>(resolve => hangingServer.close(() => resolve()));
                }
            });

            it('returns an object (never rejects) for a malformed document', async () => {
                const doc = path.join(tmpDir, 'openapi.yaml');
                fs.writeFileSync(doc, ': : not : valid : yaml : :\n\t- broken');
                const result = await Utils.resolveJsonReferences(doc);
                expect(result).to.be.an('object');
            });

            // A degenerate doc (empty or comment-only) makes json-refs reject with "obj must be an
            // Array or an Object", so resolution falls back to reading the raw file - where
            // JsYaml.load returns null/undefined WITHOUT throwing. The fallback must coalesce that to
            // a non-null object, otherwise setSwaggerDocument(null) would wedge /swagger-ui.html at
            // 503 forever (the route serves 503 until a truthy document is injected).
            const degenerateDocs: Array<[string, string]> = [
                ['empty', ''],
                ['comment-only', '# just a comment, no document body\n'],
                ['null literal', 'null\n'],
            ];
            degenerateDocs.forEach(([label, content]) => {
                it(`returns a non-null object for a ${label} document (never yields null/undefined)`, async () => {
                    const doc = path.join(tmpDir, 'openapi.yaml');
                    fs.writeFileSync(doc, content);
                    const result = await Utils.resolveJsonReferences(doc);
                    expect(result).to.not.be.equal(null);
                    expect(result).to.not.be.equal(undefined);
                    expect(result).to.be.an('object');
                });
            });
        });
    }
}
