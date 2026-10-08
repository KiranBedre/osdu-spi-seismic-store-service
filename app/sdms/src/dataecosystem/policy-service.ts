import * as f from 'fs';
import path from 'path';
import axios from 'axios';
import qs from 'qs';
import { AuthProviderFactory } from '../auth';
import { Config, DataEcosystemCoreFactory } from '../cloud';
import { Error } from '../shared';
import { IPolicyServiceResponse } from './model';

export class PolicyService {

   // To be replaced with bundles on bundle-server
   public static async insertPolicy(policyId: string, policyFile: string) {

      const authProvider = AuthProviderFactory.build(Config.SERVICE_AUTH_PROVIDER);
      const scopes = [authProvider.getClientID()];

      if (Config.DES_TARGET_AUDIENCE) {
         scopes.push(Config.DES_TARGET_AUDIENCE);
      }

      const credential = await AuthProviderFactory
         .build(Config.SERVICE_AUTH_PROVIDER)
         .generateScopedAuthCredential(scopes);

      const dataecosystemProvider = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);
      const url = Config.DES_POLICY_SERVICE_HOST + dataecosystemProvider.getPolicySvcBaseUrlPath() +
         '/policies/' + policyId;

      const options = {
         headers: {
            'AppKey': Config.DES_SERVICE_APPKEY,
            'Authorization': credential.access_token,
            'Content-Type': 'text/plain',
         }
      };

      const authRegoPolicyFile = path.join(__dirname, '..', 'docs', 'policies', policyFile);
      const contents = f.readFileSync(authRegoPolicyFile).toString();
      const data = qs.stringify({
         body: contents.replace('DES_POLICY_SERVICE_HOST', Config.DES_POLICY_SERVICE_HOST)
      });

      await axios.post(url, data, options).catch((error) => {
         throw (Error.makeForHTTPRequest(error, '[policy-service]'));
      });
   }

   public static async evaluatePolicy(datapartitionId: string, userToken: string, groupEmails: string[])
      : Promise<IPolicyServiceResponse> {

      const dataPolicyURL = Config.DES_POLICY_SERVICE_HOST + '/v1/data/dataauthz/records';
      const payload = {
         'input': {
            'datapartitionId': datapartitionId,
            'token': userToken,
            'aclGroups': groupEmails
         }
      };

      const response = await axios.post(dataPolicyURL, payload).catch((error) => {
         throw (Error.makeForHTTPRequest(error, '[policy-service]'));
      });
      return response.data as IPolicyServiceResponse;
   }
}