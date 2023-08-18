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

import { JournalFactoryTenantClient, StorageFactory } from '..';
import { DatasetDAO, DatasetModel } from '../../services/dataset';
import { Locker } from '../../services/dataset/locker';
import { SubProjectModel } from '../../services/subproject';
import { Config } from '../config';
import { LoggerFactory } from '../logger';
import * as Redis from 'ioredis';

import Bull from 'bull';

// [TODO] this file should be moved in the main shared folder (not under cloud/shared)
export class StorageJobManager {

   public static copyJobsQueue: Bull.Queue;

   public static setup(cacheParams: { ADDRESS: string, PORT: number, KEY?: string, DISABLE_TLS?: boolean; }) {

      const redisOptions: Redis.RedisOptions = {
         host: cacheParams.ADDRESS,
         port: cacheParams.PORT,
         connectionName: 'sdms-copy-agent'
      };

      if (cacheParams.KEY) {
         // pragma: allowlist nextline secret
         redisOptions.password = cacheParams.KEY;
         if (!cacheParams.DISABLE_TLS) {
            redisOptions.tls = { servername: cacheParams.ADDRESS };
         }
      }

      StorageJobManager.copyJobsQueue = new Bull('copyjobqueue', {
         redis: redisOptions,
         limiter: {
            max: 100,
            duration: 600000,
         }
      });

      // setup job processing callback
      // tslint:disable-next-line: no-floating-promises
      StorageJobManager.copyJobsQueue.process(50, (input) => {
         return StorageJobManager.copy(input);
      }).catch(
         // tslint:disable-next-line:  no-console
         (error) => { LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)); });

      // setup  handlers for job events
      StorageJobManager.setupEventHandlers();

   }

   private static setupEventHandlers() {

      StorageJobManager.copyJobsQueue.on('failed', (input) => {
         LoggerFactory.build(Config.CLOUDPROVIDER).error(
            'Copy job failure event for dataset' + input.data.datasetFrom.name +
            ' to ' + input.data.datasetTo.name + ' emitted.');
      });

      StorageJobManager.copyJobsQueue.on('error', (error) => {
         LoggerFactory.build(Config.CLOUDPROVIDER).error(error);
      });

   }

   public static async copy(input: any) {

      enum TransferStatus {
         Completed = 'Completed',
         Aborted = 'Aborted'
      }

      const LOCK_ACQUIRE_MAX_ATTEMPTS = 100;

      let registeredDataset: DatasetModel;
      let registeredDatasetKey: any;
      const journalClient = JournalFactoryTenantClient.get(input.data.tenant);
      const datasetToPath = input.data.datasetTo.tenant + '/' +
         input.data.datasetTo.subproject + input.data.datasetTo.path + input.data.datasetTo.name;
      const datasetFromPath = input.data.datasetFrom.tenant + '/' +
         input.data.datasetFrom.subproject + input.data.datasetFrom.path + input.data.datasetTo.name;

      let cacheMutex: any;
      try {

         // try about 100 times to acquire mutex before failing the job
         try {
            for (let i = 0; i < LOCK_ACQUIRE_MAX_ATTEMPTS; i++) {
               cacheMutex = await Locker.acquireMutex(datasetToPath);

               if (cacheMutex) {
                  break;
               }

            }
         } catch (err) {
            LoggerFactory.build(Config.CLOUDPROVIDER).error(
               '[copy-transfer] Unable to acquire the lock for ' + datasetToPath + 'during copy job.');
            throw err;
         }

         // Retrieve the dataset metadata and key
         if ((input.data.subproject as SubProjectModel).enforce_key) {
            registeredDataset = await DatasetDAO.getByKey(journalClient, input.data.datasetTo);
            registeredDatasetKey = journalClient.createKey({
               namespace: Config.SEISMIC_STORE_NS +
                  '-' + input.data.datasetTo.tenant + '-' + input.data.datasetTo.subproject,
               path: [Config.DATASETS_KIND],
               enforcedKey: input.data.datasetTo.path.slice(0, -1) + '/' + input.data.datasetTo.name
            });
         } else {
            const results = await DatasetDAO.get(journalClient, input.data.datasetTo);
            registeredDataset = results[0];
            registeredDatasetKey = results[1];
         }

         if (!registeredDataset) {
            throw new Error('Dataset ' + datasetToPath + 'is not registered, aborting copy');
         }

         const storage = StorageFactory.build(Config.CLOUDPROVIDER, input.data.tenant);

         LoggerFactory.build(Config.CLOUDPROVIDER).info(
            '[copy-transfer] starting copy operations to ' + datasetToPath);

         await storage.copy(input.data.sourceBucket, input.data.prefixFrom,
            input.data.destinationBucket, input.data.prefixTo, input.data.usermail);

         registeredDataset.transfer_status = TransferStatus.Completed;

         await DatasetDAO.update(journalClient, registeredDataset, registeredDatasetKey);

         await Locker.releaseMutex(cacheMutex);

         const lockKeyFrom = input.data.datasetFrom.tenant + '/' + input.data.datasetFrom.subproject +
            input.data.datasetFrom.path + input.data.datasetFrom.name;
         await Locker.unlock(lockKeyFrom, input.data.readlockId);

         const lockKeyTo = input.data.datasetTo.tenant + '/' + input.data.datasetTo.subproject +
            input.data.datasetTo.path + input.data.datasetTo.name;
         await Locker.unlock(lockKeyTo, registeredDataset.sbit);

         LoggerFactory.build(Config.CLOUDPROVIDER).info(
            '[copy-transfer] completed copy operations to ' + datasetToPath);

      }
      catch (err) {

         LoggerFactory.build(Config.CLOUDPROVIDER).error(
            '[copy-transfer] Copy operations from ' + datasetFromPath + 'to ' + datasetToPath + 'failed due to'
            + JSON.stringify(err));
         if (cacheMutex) {
            await Locker.del(datasetToPath);
            await Locker.del(datasetFromPath);
            await Locker.releaseMutex(cacheMutex);
         }

         // try to update the status to aborted if possible
         if (registeredDataset) {
            registeredDataset.transfer_status = TransferStatus.Aborted;
            await DatasetDAO.update(journalClient, registeredDataset, registeredDatasetKey);
         }

         throw err;
      }

   }
}


