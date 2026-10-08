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

import { LoggerFactory } from '../cloud';
import { Config } from '../cloud';
import { Feature, FeatureFlags } from './featureflags';

export class TraceLog {

    private traceName: string;
    private traceTS: Date;
    private trace: object[];
    private stepName: string;
    private stepTime: number;

    constructor(traceName: string) {
        this.trace = [];
        this.traceName = traceName;
        this.traceTS = new Date();
    }

    public start(name: string) {
        this.stepName = name;
        this.stepTime = new Date().getTime();
    }

    public stop() {
        this.trace.push({ step: this.stepName, eta: new Date().getTime() - this.stepTime });
    }

    public flush() {
        const tracelog = {
            name: this.traceName,
            tend: new Date(),
            trace: this.trace.length > 0 ? this.trace : undefined,
            tstart: this.traceTS,
        };
        if(FeatureFlags.isEnabled(Feature.LOGGING))  {
            LoggerFactory.build(Config.CLOUDPROVIDER).info(tracelog);
        }
    }

}
