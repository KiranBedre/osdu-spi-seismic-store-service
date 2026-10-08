// ============================================================================
// Copyright 2017-2019, Schlumberger
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

// required dependencies
const path = require('path');
const async = require('async');
const newman = require('newman');
const { performance } = require('perf_hooks');
const { exit } = require('process');

const POLICY = {
    one_only_succeed: 'one_only_succeed',
    all_succeed: 'all_succeed'
}

function ok(resolve, t0) {
    process.stdout.write('OK\n');
    process.stdout.write('  execution time: ' + Math.trunc((performance.now() - t0)) + ' (ms)\n');
    resolve();
}

function runTest(collectionName, numberParallelRun, policy) {

    let t0 = performance.now()

    process.stdout.write('\n- running: ' + collectionName + '\n')
    process.stdout.write('  policy: ' + policy + '\n')
    process.stdout.write('  niter: ' + numberParallelRun + '\n')
    process.stdout.write('  status: ');

    return new Promise((resolve, reject) => {

        // create task
        const task = (done) => {
            newman.run({
                collection: path.join(__dirname, collectionName), // the collection
                environment: path.join(__dirname, 'postman_env.json') // the test environment
                // reporters: 'cli' // enable this if you want to fully debug the script
            }, done);
        };

        // push command multiple times (n parallel process) in an array (create task list)
        const taskList = [];
        for (let index = 0; index < numberParallelRun; index++) {
            taskList.push(task);
        }

        // Runs the Postman sample collection n-times, in parallel.
        async.parallel(taskList, (err, results) => {

            if (err) { reject(err); }

            // evaluate policy all succeed
            if (policy === POLICY.all_succeed) {
                results.forEach((result) => {
                    if (result.run.failures && result.run.failures.length > 0) {
                        reject('ERROR');
                    }
                });
                ok(resolve, t0);
            }

            // evaluate policy only one succeed
            if (policy === POLICY.one_only_succeed) {
                let fail = 0;
                results.forEach((result) => {
                    fail += ((result.run.failures && result.run.failures.length > 0) ? 1 : 0);
                });
                fail === numberParallelRun - 1 ? ok(resolve, t0) : reject('ERROR');
            }

        });

    });

}

async function run() {

    try {

        // test register dataset
        await runTest('postman_collection.dataset_delete.json', 1, POLICY.one_only_succeed);
        await runTest('postman_collection.dataset_register.json', 10, POLICY.one_only_succeed);
        
        // test generate gcs token
        await runTest('postman_collection.gcstoken.json', 10, POLICY.all_succeed);

        // test lock read dataset
        await runTest('postman_collection.dataset_delete.json', 1, POLICY.one_only_succeed);
        await runTest('postman_collection.dataset_register.json', 1, POLICY.one_only_succeed);
        await runTest('postman_collection.dataset_unlock.json', 1, POLICY.one_only_succeed);
        await runTest('postman_collection.dataset_readlock.json', 10, POLICY.all_succeed);

        // test lock write dataset
        await runTest('postman_collection.dataset_delete.json', 1, POLICY.one_only_succeed);
        await runTest('postman_collection.dataset_register.json', 1, POLICY.one_only_succeed);
        await runTest('postman_collection.dataset_unlock.json', 1, POLICY.one_only_succeed);
        await runTest('postman_collection.dataset_writelock.json', 10, POLICY.one_only_succeed);

    } catch (error) { console.log(error); exit(1); }
}

run();
