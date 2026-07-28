// Copyright © 2020 Amazon Web Services
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

import { TenantModel } from "../../../services/tenant";
import {
  AbstractJournal,
  AbstractJournalTransaction,
  IJournalQueryModel,
  IJournalTransaction,
  JournalFactory,
} from "../../journal";
import { AWSConfig } from "./config";

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
  ScanCommandInput,
  AttributeValue
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { AWSDataEcosystemServices } from "./dataecosystem";

/**
 * Recover tenant (and subproject, for datasets) from a journal namespace.
 *
 * Callers build `SEISMIC_STORE_NS + '-' + tenant [+ '-' + subproject]`, and
 * SEISMIC_STORE_NS ('seismic-store-<env>') itself contains hyphens. We strip that known
 * prefix and treat the remainder verbatim (like Azure's cosmosdb.ts) instead of positionally
 * splitting on '-', which truncated hyphenated tenant names. Subprojects are hyphen-free
 * (ALLOWED_NAMES_REGEX), so for datasets the subproject is the last '-' segment. Hyphen-free
 * tenants yield byte-identical keys/filters, so no data migration is needed.
 *
 * Namespaces without the prefix fall through to the legacy positional parse — still reached
 * in production by the tenant journal (Config.ORGANIZATION_NS + TENANTS_KIND, see
 * services/tenant/dao.ts), which ignores the returned values, so it stays a fallback rather
 * than a throw.
 */
function parseNamespace(
  namespace: string,
  isDataset: boolean
): { tenant: string; subproject: string } {
  const prefix = AWSConfig.SEISMIC_STORE_NS + "-";
  if (namespace.startsWith(prefix)) {
    const remainder = namespace.substring(prefix.length);
    if (isDataset) {
      // subproject is hyphen-free, so it is the last '-' segment.
      const lastDash = remainder.lastIndexOf("-");
      if (lastDash < 0) {
        // Dataset namespace must include a subproject; fail loud instead of corrupting the key.
        throw new Error(
          "dataset namespace missing subproject segment: " + namespace
        );
      }
      return {
        tenant: remainder.substring(0, lastDash),
        subproject: remainder.substring(lastDash + 1),
      };
    }
    return { tenant: remainder, subproject: "" };
  }
  // Legacy fallback (see JSDoc): tenant journal ORGANIZATION_NS/TENANTS_KIND — values unused
  // — and pre-existing tests. Positional parse preserved so those keys/filters are unchanged.
  const strs = namespace.split("-");
  return {
    tenant: isDataset ? strs[strs.length - 2] : strs[strs.length - 1],
    subproject: strs[strs.length - 1],
  };
}

@JournalFactory.register("aws")
export class AWSDynamoDbDAO extends AbstractJournal {
  public KEY: any = Symbol("id");
  private dataPartition: string;
  private tenant: TenantModel;
  private db: DynamoDBClient;
  private tenantTablePrefix: string;
  private static ALLOWED_NAMES_REGEX: Map<string, RegExp> = new Map([
    [AWSConfig.SUBPROJECTS_KIND, /^[^-]+$/],
  ]);

  public constructor(tenant: TenantModel, db: DynamoDBClient = new DynamoDBClient({ region: AWSConfig.AWS_REGION })) {
    super();
    this.tenant = tenant;
    this.dataPartition =
      tenant.esd.indexOf(".") !== -1 ? tenant.esd.split(".")[0] : tenant.esd;
    this.tenantTablePrefix = "";
    this.db = db;
  }

  public async getPartitionTenant() {
    if (this.tenantTablePrefix === "") {
      const tenantId =
        await AWSDataEcosystemServices.getTenantIdFromPartitionID(
          this.dataPartition
        );
      this.tenantTablePrefix = tenantId;
    }
  }

  public async getTableName(table: string): Promise<string> {
    await this.getPartitionTenant();
    const lastIndex = table.lastIndexOf("-");
    return (
      table.substring(0, lastIndex) +
      "-" +
      this.tenantTablePrefix +
      table.substring(lastIndex)
    );
  }
  public async save(datasetEntity: any): Promise<void> {
    if (!(datasetEntity instanceof Array)) {
      datasetEntity = [datasetEntity];
    }
    for (const entity of datasetEntity) {
      const item = entity.data;
      // The following is required due to the possibility that subprojects may have the `-` character.
      // We need to disallow it.
      // eslint-disable-next-line @stylistic/max-len
      // https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-sdutil/-/issues/10
      const tableKind = entity.key.tableKind;
      const mustMatchRegex = AWSDynamoDbDAO.ALLOWED_NAMES_REGEX.get(tableKind);
      if (mustMatchRegex !== undefined) {
        const name = entity.key.name;
        if (!mustMatchRegex.test(name))
          throw new Error(`Invalid name ${name} for ${tableKind}`);
      }
      // id attribute is used by aws as partitionKey.
      // For tenant, id = name, for subproject, id=tenant:name;
      // for dataset, id=tenant:subproject:name:path; for app, id=tenant:email
      const strs = entity.key.partitionKey.split(":");
      if (tableKind === AWSConfig.DATASETS_KIND && strs.length === 2) {
        // fill in data name and path to the key
        entity.key.partitionKey =
          entity.key.partitionKey + ":" + item.name + ":" + item.path;
      }
      if (tableKind === AWSConfig.APPS_KIND) {
        item["tenant"] = strs[0]; // add tenant entry for App table
      }
      item["id"] = entity.key.partitionKey;
      if (entity.ctag) {
        item["ctag"] = entity.ctag;
      }
      // save extra info as this property will be consumed by the service to identify a data record
      const keyString = this.KEY.toString();
      // Store the key as a plain object to avoid nested marshalling
      item[keyString] = JSON.parse(JSON.stringify(entity.key));

      const tenantTable = await this.getTableName(entity.key.tableName);
      const itemMarshall = marshall(item, {removeUndefinedValues: true});
      console.log(
        "from table " + tenantTable + " save " + JSON.stringify(itemMarshall)
      );
      const para = {
        TableName: tenantTable,
        Item: itemMarshall,
      };
      try {
      await this.db.send(new PutItemCommand(para));
    } catch (error) {
      console.error("Error saving item:", error);
      throw error;
    }
    }
  }

  public async get(key: any): Promise<[any]> {
    const tenantTable = await this.getTableName(key.tableName);
    const item = { id: key.partitionKey };
    const itemMarshall = marshall(item, {removeUndefinedValues: true});
    console.log(
      "from table " + tenantTable + " get " + JSON.stringify(itemMarshall)
    );
    const params = {
      TableName: tenantTable,
      Key: itemMarshall,
    };
    const data = await this.db.send(new GetItemCommand(params));
    if (!data.Item) return [undefined];
    const ret = unmarshall(data.Item);
    if (Object.keys(ret).length === 0) return [undefined];
    else {
      // remove aws specific attribute id
      delete ret["id"];
      // to pass integration test
      delete ret[this.KEY.toString()];
      return [ret];
    }
  }

  public async delete(key: any): Promise<void> {
    const tenantTable = await this.getTableName(key.tableName);
    const item = { id: key.partitionKey };
    const itemMarshall = marshall(item, { removeUndefinedValues: true });
    console.log(
      "from table " + tenantTable + " delete " + JSON.stringify(itemMarshall)
    );
    const params = {
      TableName: tenantTable,
      Key: itemMarshall,
    };

    await this.db.send(new DeleteItemCommand(params));
  }

  public createQuery(namespace: string, kind: string): IJournalQueryModel {
    return new AWSDynamoDbQuery(namespace, kind);
  }

  public async runQuery(
    query: IJournalQueryModel
  ): Promise<[any[], { endCursor?: string }]> {
    await this.getPartitionTenant();
    const dbQuery = query as AWSDynamoDbQuery;
    const statement = dbQuery.getQueryStatement(
      dbQuery.kind,
      this.tenantTablePrefix
    );

    console.log("query " + JSON.stringify(statement));
    let scanResults = [];
    let items;
    do {
      items = await this.db.send(new ScanCommand(statement));
      if (!items.Items) break;
      const results = items.Items.map((result) => {
        let ret = unmarshall(result);
        // update object property for service (dao.ts) to consume
        if (ret[this.KEY.toString()]) {
          // Handle the Symbol key properly for v3 SDK
          const keyValue = ret[this.KEY.toString()];
          ret[this.KEY] = typeof keyValue === 'object' && keyValue.M ? unmarshall(keyValue) : keyValue;
        }
        return ret;
      });
      scanResults = scanResults.concat(results);
      statement.ExclusiveStartKey = items.LastEvaluatedKey;
    } while (items.LastEvaluatedKey);
    return Promise.resolve([
      scanResults,
      { endCursor: items?.LastEvaluatedKey },
    ]);
  }

  public createKey(specs: any): object {
    const tableKind = specs.path[0];
    const name = specs.path[1]; // our key
    let partitionKey = name; // partitionKey

    const { tenant, subproject } = parseNamespace(
      specs.namespace,
      tableKind === AWSConfig.DATASETS_KIND
    );
    if (tableKind === AWSConfig.SUBPROJECTS_KIND) {
      partitionKey = tenant + ":" + partitionKey; // tenant:subproject for id
    }
    if (tableKind === AWSConfig.DATASETS_KIND) {
      partitionKey = tenant + ":" + subproject; // tenant:subproject for id
    }
    if (tableKind === AWSConfig.APPS_KIND) {
      partitionKey = tenant + ":" + name; // tenant:subproject for id
    }

    const tableName =
      AWSConfig.AWS_TENANT_GROUP_NAME + "-" + "SeismicStore." + specs.path[0];
    return { tableName, name, tableKind, partitionKey };
  }

  public getTransaction(): IJournalTransaction {
    return new AWSDynamoDbTransactionDAO(this);
  }

  public getQueryFilterSymbolContains(): string {
    return "CONTAINS";
  }
}

declare type OperationType = "save" | "delete";
export class AWSDynamoDbTransactionOperation {
  public constructor(type: OperationType, entityOrKey: any) {
    this.type = type;
    this.entityOrKey = entityOrKey;
  }

  public type: OperationType;
  public entityOrKey: any;
}

export class AWSDynamoDbTransactionDAO extends AbstractJournalTransaction {
  public KEY = null;

  public constructor(owner: AWSDynamoDbDAO) {
    super();
    this.owner = owner;
    this.KEY = this.owner.KEY;
  }

  public async save(entity: any): Promise<void> {
    console.log("aws Transaction Save " + JSON.stringify(entity));
    this.queuedOperations.push(
      new AWSDynamoDbTransactionOperation("save", entity)
    );
    await Promise.resolve();
  }

  public async get(key: any): Promise<[any]> {
    console.log("aws Transaction get " + JSON.stringify(key));
    return this.owner.get(key);
  }

  public async delete(key: any): Promise<void> {
    console.log("aws Transaction delete " + JSON.stringify(key));
    this.queuedOperations.push(
      new AWSDynamoDbTransactionOperation("delete", key)
    );
    await Promise.resolve();
  }

  public createQuery(namespace: string, kind: string): IJournalQueryModel {
    console.log("aws Transaction createQuery " + namespace + kind);
    return this.owner.createQuery(namespace, kind);
  }

  public async runQuery(
    query: IJournalQueryModel
  ): Promise<[any[], { endCursor?: string }]> {
    console.log("aws Transaction runQuery " + JSON.stringify(query));
    return this.owner.runQuery(query);
  }

  public async run(): Promise<void> {
    console.log("aws Transaction run ");
    if (this.queuedOperations.length) {
      return Promise.reject(new Error("Transaction is already in use."));
    } else {
      this.queuedOperations = [];
      return Promise.resolve();
    }
  }

  public async rollback(): Promise<void> {
    console.log("aws Transaction rollback ");
    this.queuedOperations = [];
    return Promise.resolve();
  }

  public async commit(): Promise<void> {
    console.log("aws Transaction commit ");
    for (const operation of this.queuedOperations) {
      if (operation.type === "save") {
        await this.owner.save(operation.entityOrKey);
      }
      if (operation.type === "delete") {
        await this.owner.delete(operation.entityOrKey);
      }
    }

    this.queuedOperations = [];
    return Promise.resolve();
  }

  public getQueryFilterSymbolContains(): string {
    return "CONTAINS";
  }

  private owner: AWSDynamoDbDAO;
  public queuedOperations: AWSDynamoDbTransactionOperation[] = [];
}

declare type Operator =
  | "="
  | "<"
  | ">"
  | "<="
  | ">="
  | "HAS_ANCESTOR"
  | "CONTAINS";
export class AWSDynamoDbQuery implements IJournalQueryModel {
  public constructor(namespace: string, kind: string) {
    this.namespace = namespace;
    this.kind = kind;
    this.queryStatement = {
      TableName: kind,
      FilterExpression: "",
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {} as Record<string, AttributeValue>,
      ProjectionExpression: "",
    };
  }
  public namespace: string;
  public kind: string;
  public queryStatement: ScanCommandInput;

  filter(property: string, value: {}): IJournalQueryModel;

  filter(property: string, operator: Operator, value: {}): IJournalQueryModel;

  filter(
    property: string,
    operator?: Operator,
    value?: {}
  ): IJournalQueryModel {
    if (operator === "CONTAINS") {
      if (this.queryStatement.FilterExpression) {
        this.queryStatement.FilterExpression += " AND ";
      }
      let i = 0;
      let propertyValue = property;
      while (
        this.queryStatement.ExpressionAttributeValues.hasOwnProperty(
          `:${propertyValue}`
        )
      ) {
        propertyValue = `${property}${i}`;
        i++;
      }
      this.queryStatement.FilterExpression +=
        "contains(#" + property + ",:" + propertyValue + ")";
      this.queryStatement.ExpressionAttributeNames["#" + property] = property;
      this.queryStatement.ExpressionAttributeValues[":" + propertyValue] = { S: value as string };
      return this;
    }
    if (value === undefined) {
      value = operator;
      operator = "=";
    }
    if (operator === undefined) {
      operator = "=";
    }
    if (value === undefined) {
      value = "";
    }

    if (operator === "HAS_ANCESTOR") {
      throw new Error(
        "HAS_ANCESTOR operator is not supported in query filters."
      );
    }

    if (this.queryStatement.FilterExpression) {
      this.queryStatement.FilterExpression += " AND ";
    }

    if (property === "path") {
      property = "p";
      const pathProperty = "path";
      this.queryStatement.FilterExpression +=
        "#" + property + operator + ":" + property;
      this.queryStatement.ExpressionAttributeNames["#" + property] =
        pathProperty;
      this.queryStatement.ExpressionAttributeValues[":" + property] = { S: value as string };
    } else {
      this.queryStatement.FilterExpression +=
        "#" + property + operator + ":" + property;
      this.queryStatement.ExpressionAttributeNames["#" + property] = property;
      this.queryStatement.ExpressionAttributeValues[":" + property] = { S: value as string };
    }
    return this;
  }

  start(start: string | Buffer): IJournalQueryModel {
    if (start instanceof Buffer) {
      throw new Error(
        "Type 'Buffer' is not supported for DynamoDB Continuation while paging."
      );
    }
    console.log("NOT SUPPORT aws start createQuery " + start);
    return this;
  }

  limit(n: number): IJournalQueryModel {
    this.queryStatement.Limit = n;
    return this;
  }

  groupBy(fieldNames: string | string[]): IJournalQueryModel {
    console.log("NOT SUPPORT aws groupBy createQuery " + fieldNames);
    return this;
  }

  select(fieldNames: string | string[]): IJournalQueryModel {
    if (this.queryStatement.ProjectionExpression.length >= 1)
      this.queryStatement.ProjectionExpression += ",";
    if (typeof fieldNames === "string") {
      this.queryStatement.ProjectionExpression += fieldNames;
    } else {
      // Handle array of field names
      const firstField = fieldNames[0];
      if (firstField === "path") {
        this.queryStatement.ProjectionExpression += "#p";
      } else {
        this.queryStatement.ProjectionExpression += fieldNames.join(",");
      }
    }
    return this;
  }
  public getQueryStatement(
    tableName: string,
    tenantTablePrefix: string
  ): ScanCommandInput {
    // since we have one table for all datasets, we need to
    // add more filters to return dataset specific for that tenant/subproject
    const { tenant, subproject } = parseNamespace(
      this.namespace,
      this.kind === AWSConfig.DATASETS_KIND
    );
    if (
      this.kind === AWSConfig.DATASETS_KIND ||
      this.kind === AWSConfig.SUBPROJECTS_KIND
    ) {
      // one table, filter on tenant
      if (this.queryStatement.FilterExpression) {
        this.queryStatement.FilterExpression += " AND ";
      }
      const tProperty: string = "tenant";
      const value: string = tenant;
      this.queryStatement.FilterExpression +=
        "#" + tProperty + "=" + ":" + tProperty;
      this.queryStatement.ExpressionAttributeNames["#" + tProperty] = tProperty;
      this.queryStatement.ExpressionAttributeValues[":" + tProperty] = { S: value };
    }
    if (this.kind === AWSConfig.DATASETS_KIND) {
      // one table, filter on subproject too
      this.queryStatement.FilterExpression += " AND ";
      const tProperty: string = "subproject";
      const value: string = subproject;
      this.queryStatement.FilterExpression +=
        "#" + tProperty + "=" + ":" + tProperty;
      this.queryStatement.ExpressionAttributeNames["#" + tProperty] = tProperty;
      this.queryStatement.ExpressionAttributeValues[":" + tProperty] = { S: value };
    }

    if (this.kind === AWSConfig.APPS_KIND) {
      // one table, filter on tenant
      if (this.queryStatement.FilterExpression) {
        this.queryStatement.FilterExpression += " AND ";
      }
      const tProperty: string = "tenant";
      const value: string = tenant;
      this.queryStatement.FilterExpression +=
        "#" + tProperty + "=" + ":" + tProperty;
      this.queryStatement.ExpressionAttributeNames["#" + tProperty] = tProperty;
      this.queryStatement.ExpressionAttributeValues[":" + tProperty] = { S: value };
    }

    if (this.queryStatement.FilterExpression.length === 0)
      delete this.queryStatement.FilterExpression;

    if (this.queryStatement.ProjectionExpression.length === 0)
      delete this.queryStatement.ProjectionExpression;

    // delete empty objects in query parameters
    if (
      Object.entries(this.queryStatement.ExpressionAttributeNames).length === 0
    ) {
      delete this.queryStatement.ExpressionAttributeNames;
      delete this.queryStatement.ExpressionAttributeValues;
    }
    this.queryStatement.TableName =
      AWSConfig.AWS_TENANT_GROUP_NAME +
      "-" +
      tenantTablePrefix +
      "-" +
      "SeismicStore." +
      tableName;
    return this.queryStatement;
  }
}
