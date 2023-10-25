<!--- Deploy -->

# Deploy helm chart

## Introduction

This chart bootstraps a deployment on a [Kubernetes](https://kubernetes.io) cluster using [Helm](https://helm.sh) package manager.

## Prerequisites

The code was tested on **Kubernetes cluster** (v1.21.11) with **Istio** (1.12.6)
> It is possible to use other versions, but it hasn't been tested

### Operation system

The code works in Debian-based Linux (Debian 10 and Ubuntu 20.04) and Windows WSL 2. Also, it works but is not guaranteed in Google Cloud Shell. All other operating systems, including macOS, are not verified and supported.

### Packages

Packages are only needed for installation from a local computer.

* **HELM** (version: v3.7.1 or higher) [helm](https://helm.sh/docs/intro/install/)
* **Kubectl** (version: v1.21.0 or higher) [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl)

## Installation

Before installing deploy Helm chart you need to install [configmap Helm chart](../configmap).
First you need to set variables in **values.yaml** file using any code editor. Some of the values are prefilled, but you need to specify some values as well. You can find more information about them below.

### Global variables

| Name | Description | Type | Default |Required |
|------|-------------|------|---------|---------|
**global.domain** | your domain for the external endpoint, ex `example.com` | string | - | yes
**global.onPremEnabled** | whether on-prem is enabled | boolean | false | yes
**global.limitsEnabled** | whether CPU and memory limits are enabled | boolean | true | yes

### Configmap variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**data.logLevel** | logging level | string | "ERROR" | yes
**data.cloudProvider** | cloud provider | string | "gc" | yes
**data.port** | port | string | "5000" | yes
**data.partitionHost** | partition service endpoint | string | "<http://partition>" | yes
**data.storageHost** | storage service endpoint | string | "<http://storage>" | yes
**data.legalHost** | legal service endpoint | string | "<http://legal>" | yes
**data.entitlementsHost** | entitlements service endpoint | string | "<http://entitlements>" | yes
**data.redisSdmsHost** | The host for redis instance. If empty (by default), helm installs an internal redis instance | string | - | yes
**data.redisSdmsPort** | redis instance port | string | "6379" | yes
**data.redisSdmsTlsDisabled** | redis tls disabled conf | bool | "true" | yes
**data.serviceEnv** | service environment | string | "dev" | yes

### Deployment variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**data.requestsCpu** | amount of requested CPU | string | "5m" | yes
**data.requestsMemory** | amount of requested memory| string | "150Mi" | yes
**data.limitsCpu** | CPU limit | string | "1" | only if `global.limitsEnabled` is true
**data.limitsMemory** | memory limit | string | "1G" | only if `global.limitsEnabled` is true
**data.serviceAccountName** | name of your service account | string | "seismic-store" | yes
**data.imagePullPolicy** | when to pull image | string | "IfNotPresent" | yes
**data.image** | service image | string | - | yes
**data.redisImage** | service image | string | `docker.io/library/redis:7` | yes

### Config variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**conf.configmap** | configmap to be used | string | "seismic-store-config" | yes
**conf.appName** | name of the app | string | "seismic-store" | yes
**conf.sdmsRedisSecretName** | sdms Redis secret that contains redis password with REDIS_PASSWORD key | string | `seismic-store-redis-secret` | yes

### On-prem variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**conf.database** | secret for database | string | "seismic-store-db-secret" | yes
**conf.keycloak** | secret for keycloak | string | "seismic-store-keycloak-secret" | yes
**conf.minio** | secret for minio, shoud contain SDMS_BUCKET variable | string | "seismic-store-minio-secret" | yes

### ISTIO variables

| Name | Description | Type | Default |Required |
|------|-------------|------|---------|---------|
**istio.proxyCPU** | CPU request for Envoy sidecars | string | 6m | yes
**istio.proxyCPULimit** | CPU limit for Envoy sidecars | string | 500m | yes
**istio.proxyMemory** | memory request for Envoy sidecars | string | 50Mi | yes
**istio.proxyMemoryLimit** | memory limit for Envoy sidecars | string | 512Mi | yes

### Install the helm chart

Run this command from within this directory:

```console
helm install gc-seismic-store-sdms-deploy .
```

## Uninstalling the Chart

To uninstall the helm deployment:

```console
helm uninstall gc-seismic-store-sdms-deploy
```

[Move-to-Top](#deploy-helm-chart)
