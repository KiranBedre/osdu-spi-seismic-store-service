# Cosmos Single to Cross Partition Migration Script

The initial implementation of SDMS in azure saves all subproject's datasets descriptors under the same key in cosmos. Because of this construction, datasets are saved in a single physical partition with an imposed limited throughput of 10kRu/s. This model limits SDMS performances.

The provided script migrates the SDMS internal journal key model in order to spread datasets to multiple physical partitions by assigning a dedicated key to each dataset.

The new key schema model has been introduced from the release 0.15. Partitions created before the release 0.15 require migration of the database to the new key model. Partitions created from the release 0.15 don't require a migration. To check if a partition requires a migrated of the internal journal please use the --status options with the migration script (see usage section below).

## Single Vs Cross Partitions Schema

ENTITY | SINGLE PARTITION SCHEMA | CROSS PARTITION SCHEMA
------ | ------ | ------
database name | seistore-\<partition\>-db | sdms-db
container name | sdms-\<partition\>-container | data
tenant key | organization-\<env\>-tenants | tn-\<tenant\>
subproject key | seismic-store-\<env\>-\<tenant\>-subprojects | sp-\<subproject\>
dataset key | seismic-store-\<env\>-\<tenant\>-\<subproject\>-datasets | ds-\<tenant\>-\<subproject\>-hash\(dataset\)

## Migration Script Detailed

Usage: ts-node migrator.ts --cosmos-endpoint= --cosmos-key= --partition= (--status)

- Checks if the single partition schema db exist.
- Checks if the single partition schema container exist in the db.
- Creates, if not exist, the new db to host records with the new key schema.
- Creates, if not exist, the container under the new db.
- Until there are no more records to read.
  - Read next 100 records for single partition db.
  - Create the new key for each record .
  - Update the internal Symbol(id) filed for each record.
  - Save all 100 records to the cross partition db.

## Notes

- **NOTE-01**: The script won't delete the single partition db!
- **NOTE-02**: In case the script fail it can be restarted and it will automatically continue from the point of failure.
- **NOTE-03**: During the migration process of a partition the service will reply with an HTTP 503 error at each request to the partition. Other partitions won't be affected by the migration process.
