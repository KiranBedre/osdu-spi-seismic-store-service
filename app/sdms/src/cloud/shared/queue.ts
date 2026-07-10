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

import type { RedisOptions } from 'ioredis';
import Bull from 'bull';
import { JournalFactoryTenantClient, StorageFactory } from '..';
import { DatasetDAO, DatasetModel } from '../../services/dataset';
import { lockerInstance } from '../../services/dataset/locker';
import { SubProjectModel } from '../../services/subproject';
import { Config } from '../config';
import { LoggerFactory } from '../logger';

// [TODO] this file should be moved in the main shared folder (not under cloud/shared)
export class StorageJobManager {

   public copyJobsQueue: Bull.Queue;
   protected readonly COPY_QUEUE_LIMIT_MAX = 100;
   protected readonly COPY_QUEUE_LIMIT_DURATION_MS = 600000;
   protected readonly COPY_QUEUE_CONCURRENCY = 50;
   protected readonly LOCK_ACQUIRE_MAX_ATTEMPTS = 100;

   public async setup(cacheParams: { ADDRESS: string, PORT: number, KEY?: string, DISABLE_TLS?: boolean; }) {
      const redisOptions: RedisOptions = {
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

      this.copyJobsQueue = new Bull('copyjobqueue', {
         redis: redisOptions,
         limiter: {
            max: this.COPY_QUEUE_LIMIT_MAX,
            duration: this.COPY_QUEUE_LIMIT_DURATION_MS
         }
      });

      // setup job processing callback
      this.copyJobsQueue.process(this.COPY_QUEUE_CONCURRENCY, (input) => {
         return this.copy(input);
      }).catch(
         (error) => { LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)); });

      // setup  handlers for job events
      this.setupEventHandlers();
   }

   protected setupEventHandlers() {

      this.copyJobsQueue.on('failed', (input) => {
         LoggerFactory.build(Config.CLOUDPROVIDER).error(
            'Copy job failure event for dataset' + input.data.datasetFrom.name +
            ' to ' + input.data.datasetTo.name + ' emitted.');
      });

      this.copyJobsQueue.on('error', (error) => {
         LoggerFactory.build(Config.CLOUDPROVIDER).error(error);
      });
   }

   public async copy(input: any) {

      enum TransferStatus {
         Completed = 'Completed',
         Aborted = 'Aborted'
      }

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
            for (let i = 0; i < this.LOCK_ACQUIRE_MAX_ATTEMPTS; i++) {
               cacheMutex = await lockerInstance.acquireMutex(datasetToPath);

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

         await lockerInstance.releaseMutex(cacheMutex);

         const lockKeyFrom = input.data.datasetFrom.tenant + '/' + input.data.datasetFrom.subproject +
            input.data.datasetFrom.path + input.data.datasetFrom.name;
         await lockerInstance.unlock(lockKeyFrom, input.data.readlockId);

         const lockKeyTo = input.data.datasetTo.tenant + '/' + input.data.datasetTo.subproject +
            input.data.datasetTo.path + input.data.datasetTo.name;
         await lockerInstance.unlock(lockKeyTo, registeredDataset.sbit);

         LoggerFactory.build(Config.CLOUDPROVIDER).info(
            '[copy-transfer] completed copy operations to ' + datasetToPath);

      }
      catch (err) {

         LoggerFactory.build(Config.CLOUDPROVIDER).error(
            '[copy-transfer] Copy operations from ' + datasetFromPath + 'to ' + datasetToPath + 'failed due to'
            + JSON.stringify(err));
         if (cacheMutex) {
            await lockerInstance.del(datasetToPath);
            await lockerInstance.del(datasetFromPath);
            await lockerInstance.releaseMutex(cacheMutex);
         }

         // try to update the status to aborted if possible
         if (registeredDataset) {
            registeredDataset.transfer_status = TransferStatus.Aborted;
            await DatasetDAO.update(journalClient, registeredDataset, registeredDatasetKey);
         }

         throw err;
      }
   }

   /**
    * Cleanup method for graceful shutdown.
    * Override in derived classes for provider-specific cleanup logic.
    */
   public async cleanup(): Promise<void> {
      // Default: no-op - override in derived classes if cleanup is needed
   }
}

// Singleton instance that will be initialized and used throughout the application
export let storageJobManagerInstance: StorageJobManager = new StorageJobManager();

/**
 * Set the active storage job manager instance. Used by cloud providers to inject their specific implementation.
 * @param instance - The storage job manager instance to use
 */
export function setStorageJobManagerInstance(instance: StorageJobManager): void {
   storageJobManagerInstance = instance;
}
