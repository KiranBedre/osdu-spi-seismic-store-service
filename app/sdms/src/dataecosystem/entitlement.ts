// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import axios from 'axios';

import { Config, DataEcosystemCoreFactory } from '../cloud';
import { IDESEntitlementGroupModel, IDESEntitlementMemberModel } from '../cloud/dataecosystem';
import { Error } from '../shared';

export class DESEntitlement {

    public static async listUsersInGroup(
        userToken: string, group: string, dataPartitionID: string, appkey: string,
        prevCursor?: string): Promise<{ members: IDESEntitlementMemberModel[], nextCursor: string; }> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json',
            }
        };
        let url = Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + group + '/members';

        if (prevCursor !== undefined) { url += ('?cursor=' + prevCursor); }

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        const res = await axios.get(url, options).catch((error) => {
            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));
        });
        const members = res.data.members;
        const nextCursor = res.data.cursor;
        return { members, nextCursor };
    }

    private static async getGroups(
        userToken: string, dataPartitionID: string, appkey: string): Promise<any> {
            const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

            const options = {
                headers: {
                    'Accept': 'application/json',
                    'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                    'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                    'Content-Type': 'application/json'
                }
            };
            const url = Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath() + '/groups';

            options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

            const results = await axios.get(url, options).catch((error) => {
                throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));
            });
            return results.data;
    }

    public static async getUserGroups(
        userToken: string, dataPartitionID: string, appkey: string): Promise<IDESEntitlementGroupModel[]> {

        return (await DESEntitlement.getGroups(userToken, dataPartitionID, appkey)).groups;
    }

    public static async getUserId(
        userToken: string, dataPartitionID: string, appkey: string): Promise<string> {

        return (await DESEntitlement.getGroups(userToken, dataPartitionID, appkey)).memberEmail;
    }

    // ensure strong consistency on cascade operation createGroup -> addMEmber
    // in seismic-dms when a subproject is create an extra admin user can also added to the created group
    // because of the imposed eventual consistency on createGroup (mex declared latency ~2s) we should ensure
    // a small retry logic is applied around the call on the returned error message
    // { "code": 404, "reason": "Not Found" }
    public static async addUserToGroup(
        userToken: string, groupName: string, dataPartitionID: string, userEmail: string,
        role: string, appkey: string, checkConsistencyForCreateGroup = false) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            }
        };
        const url = Config.DES_SERVICE_HOST_ENTITLEMENT
            + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + groupName + '/members';

        const data = JSON.stringify(dataecosystem.getUserAddBodyRequest(userEmail, role));

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            // let's have a simple linear retry backOff with 1s wait time between iterations
            // to ensure the group is created before add a user (if explicitly required)
            let counter = 0;
            while (counter < 10) {
                try {
                    await axios.post(url, data, options);
                    return;
                } catch (error) { // check eventual consistency
                    if (axios.isAxiosError(error) && !(checkConsistencyForCreateGroup
                        && error.response.status === 404)) {
                        throw (error)
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1s constant (no exp backOff required)
                counter = counter + 1;
            }

        } catch (error) {

            if (error.response.status === 409) {

                let usersList = [];
                let result = await DESEntitlement.listUsersInGroup(userToken, groupName, dataPartitionID, appkey);

                usersList = result.members;

                while (result.nextCursor) {
                    result = await DESEntitlement.listUsersInGroup(userToken, groupName, dataPartitionID, appkey);
                    usersList = [...usersList, ...result.members];
                }

                const existingUserRole = usersList.filter(user => user.email === userEmail)[0].role;

                if (existingUserRole !== role) {
                    throw (Error.make(Error.Status.ALREADY_EXISTS,
                        'User already exists but the role is not set to ' + role + ', so delete the user and re-add'));
                }
                return;
            }

            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

        }
    }

    public static async removeUserFromGroup(
        userToken: string, groupName: string, dataPartitionID: string, userEmail: string, appkey: string) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            }
        };
        const url = Config.DES_SERVICE_HOST_ENTITLEMENT
            + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + groupName + '/members/' + userEmail;

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        await axios.delete(url, options).catch((error) => {
            if (error.response.status !== 409) {
                throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));
            }
        });
    }

    public static async createGroup(
        userToken: string, groupName: string, groupDesc: string, dataPartitionID: string, appkey: string) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            }
        };
        const data = {
            description: groupDesc,
            name: groupName,
        };
        const url = Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath() + '/groups';

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        await axios.post(url, data, options).catch((error) => {
            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));
        });
    }

    public static async deleteGroup(userToken: string, groupEmail: string, dataPartitionID: string, appkey: string) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            }
        };
        const url = Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath()
            + Config.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH + groupEmail;

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        await axios.delete(url, options).catch((error) => {
            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));
        });
    }

}
