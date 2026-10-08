# Monitoring

Prometheus is used to get some stats of the service, such as:

- number of requests per time
- average http response time
- peak http response time
- cpu_percentage
- status codes distribution across different endpoints

It can be tested using the compose file available in the monitoring folder.

## Run steps locally on Windows

**Prerequisite**: The seismic store service must be up and running with the metrics endpoint available at: `http://localhost:5000/api/seismic-store/v3/metrics`

### Run Seismic Service

To be able to run the service you will need a redis instance available, the easiest way is to set up a free instance in [redis cloud](https://app.redislabs.com/), then add the host and the port to the env variables in the .env file like this:
LOCKSMAP_REDIS_INSTANCE_ADDRESS={redis-id}.redis-cloud.com
LOCKSMAP_REDIS_INSTANCE_PORT={redis-port}

Then configure the rest of the environment variables needed in the .env file in the root of the project:

```sh
# .env
CLOUDPROVIDER
DES_SERVICE_HOST_COMPLIANCE
DES_SERVICE_HOST_ENTITLEMENT
DES_SERVICE_HOST_PARTITION
DES_SERVICE_HOST_STORAGE
LOCKSMAP_REDIS_INSTANCE_KEY
LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE
LOCKSMAP_REDIS_INSTANCE_ADDRESS
LOCKSMAP_REDIS_INSTANCE_PORT
LOG_LEVEL
PORT
SDMS_BUCKET
SERVICE_ENV
Seismic
KEYCLOAK_CLIENT_ID
KEYCLOAK_CLIENT_SECRET
KEYCLOAK_URL
MINIO_ACCESS_KEY
MINIO_ENDPOINT
MINIO_SECRET_KEY
DATABASE_URL
```

Install dependencies, build and run

```sh
cd app/sdms
npm install
npm run build # required after any change in the code
npm run start
```

### Configure Prometheus Credentials to access Seismic metrics

```sh
cd app/sdms/devops/anthos/monitoring/prometheus
# open prometheus.yml
# assign access token to credentials value under authorization key
```

### Run Prometheus and Grafana

```sh
cd app/sdms/devops/anthos/monitoring
docker compose up/down
# access grafana console
# user=password=admin
```

### Check services

- seismic ddms -> `http://localhost:5000/api/seismic-store/v3/metrics`
- prometheus -> `http://localhost:9090/targets?search=`
- grafana -> `http://localhost:3000`

### Notes

- The compose file is created only to test the metrics endpoint, prometheus and build the required expressions with PromQL, because of it, some services are not fully running, to fix them, you must add the missing environment variables, such as credentials and additional configuration.
- So far, Grafana is deployed to test some metrics with prometheus, however it is planed to have a sample dashboard in the near future
