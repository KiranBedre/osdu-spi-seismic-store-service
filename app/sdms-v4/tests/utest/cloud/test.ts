
import { Tx } from '../utils';

import { TestAWSSSMHelper } from './aws/ssmhelper';
import { TestAWSCredentials } from './aws/credentials';
import { TestAWSStorage } from './aws/storage';
import { TestLogger } from './aws/logger';
import { TestAwsSecrets } from './aws/secrets';
import { TestAwsReadiness } from './aws/readiness';
import { TestAwsStsHelper } from './aws/stshelper';


export class TestCloud {

    public static run() {

        describe(Tx.title('utest seismic store - cloud core'), () => {
            TestAWSSSMHelper.run();
            TestAWSCredentials.run();
            TestAWSStorage.run();
            TestLogger.run();
            TestAwsSecrets.run();
            TestAwsReadiness.run();
            TestAwsStsHelper.run();
        });

    }

}