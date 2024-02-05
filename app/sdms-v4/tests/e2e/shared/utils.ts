// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { AxiosError, AxiosResponse } from 'axios';

export class Utils {
    public static async sendAxiosRequest(axiosRequest: Promise<AxiosResponse<any, any>>, mustThrow = true) {
        try {
            return await axiosRequest;
        } catch (e) {
            if (!mustThrow) {
                return e;
            } else {
                const error = e as AxiosError;
                if (error.response?.status) {
                    console.error('  ! Error Status: ' + error.response.status);
                }
                if (error.response?.statusText) {
                    console.error('  ! Error Status Text: ' + error.response.statusText);
                }
                if (error.response?.data) {
                    console.error('  ! Error Data: ');
                    console.error(error.response.data);
                }
                await Promise.reject(e);
            }
        }
    }

    public static generateRandomData(length: number) {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const charactersLength = characters.length;
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }
}
