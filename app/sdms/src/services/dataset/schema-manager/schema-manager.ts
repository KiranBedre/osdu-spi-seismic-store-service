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

import Ajv from 'ajv';
import addFormat from 'ajv-formats';
import { v4 as uuidv4 } from 'uuid';
import { DatasetModel, SchemaTransformModel } from '..';
import { DESUtils } from '../../../dataecosystem';
import { Error } from '../../../shared';
import { TenantModel } from '../../tenant';

export interface ISchemaManager {
   addSchemas();
   addStorageRecordDefaults(storageRecord: any, dataset: DatasetModel, tenant: TenantModel);
   applySchemaTransforms(data: object): SchemaTransformModel;
   validate(data: any): SchemaValidationResult;
}

export class SchemaManagerFactoryBuilder {

   public static async initialize() {
      for (const supportedStorageRecordSchemaType of SchemaManagerFactory.getSupportedSchemaTypes()) {
         await SchemaManagerFactory.build(supportedStorageRecordSchemaType).addSchemas();
      }
   }

   public static getSupportedSchemaTypes(): string[] {
      return Object.keys(SchemaManagerFactoryBuilder.providers);
   }

   public static register(providerLabel: string) {
      return (target: any) => {
         if (SchemaManagerFactoryBuilder.providers[providerLabel]) {
            SchemaManagerFactoryBuilder.providers[providerLabel].push(target);
         } else {
            SchemaManagerFactoryBuilder.providers[providerLabel] = [target];
         }
         return target;
      };
   }

   public static build(providerLabel: string, referenceAbstraction: any, args: { [key: string]: any; } = {}) {
      if (providerLabel === undefined || providerLabel === 'unknown') {
         throw (Error.make(Error.Status.UNKNOWN,
            `Unrecognized schema manager provider: ${providerLabel}`));
      }
      for (const provider of SchemaManagerFactoryBuilder.providers[providerLabel]) {
         if (provider.prototype instanceof referenceAbstraction) {
            return new provider(args);
         }
      }
      throw (Error.make(Error.Status.UNKNOWN,
         `The schema manager builder that extend ${referenceAbstraction} has not been found`));
   }

   private static providers: { [key: string]: any[]; } = {};

}

export abstract class AbstractSchemaManager implements ISchemaManager {
   static ajv = new Ajv({
      'strict': false,
      allErrors: true
   });
   static ajvFormatsAdded: boolean = false;

   static schemaTransformFuncMap: any = {};
   public abstract schemaID: string;
   public abstract schemaFilePath: string;
   public abstract addSchemas();
   public abstract applySchemaTransforms(data: SchemaTransformModel): SchemaTransformModel;
   public abstract validate(data: any): SchemaValidationResult;

   constructor() {
      if (!AbstractSchemaManager.ajvFormatsAdded) {
         addFormat(AbstractSchemaManager.ajv);
         AbstractSchemaManager.ajvFormatsAdded = true;
      }
   }

   addStorageRecordDefaults(storageRecord: any, dataset: DatasetModel, tenant: TenantModel) {

      if (!storageRecord) {
         return;
      }

      const recordType = ':' + (storageRecord.kind as string).split(':')[2] + ':';
      // if id is given, take it. otherwise generate
      if (!storageRecord.id) {
         dataset.seismicmeta_guid = DESUtils.getDataPartitionID(tenant.esd) +
            recordType
            + uuidv4();
         storageRecord.id = dataset.seismicmeta_guid;
      } else {
         dataset.seismicmeta_guid = storageRecord.id;
      }

      // if acl is given, take it. otherwise generate
      if (!storageRecord.acl) {
         storageRecord.acl = {
            owners: ['data.default.owners@' + tenant.esd],
            viewers: ['data.default.viewers@' + tenant.esd],
         };
      }

      // [TO REVIEW]
      // wrt legaltags, there is a field 'otherRelevantDataCountries' that will have to considered
      // for now force it to US, if does not exist. To review before complete PR
      // this could be included as default in the request
      if (!storageRecord.legal) {
         storageRecord.legal = {
            legaltags: [dataset.ltag],
            otherRelevantDataCountries: ['US'],
         };
      }

      delete storageRecord.recordType;

   }

}

export class SchemaManagerFactory extends SchemaManagerFactoryBuilder {
   public static build(providerLabel: string): AbstractSchemaManager {
      return SchemaManagerFactoryBuilder.build(providerLabel, AbstractSchemaManager) as AbstractSchemaManager;
   }
}


export class SchemaTransformFuncManager {
   public static register(id: string) {
      return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
         AbstractSchemaManager.schemaTransformFuncMap[id] = descriptor;
      };
   }
}

export interface SchemaValidationResult {
   valid: boolean,
   err?: string;
}