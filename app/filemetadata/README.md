# Introduction

This project will provide the restful APIs to access SEGY file headers. There are 3 ways to build and test this service: **locally**, via **docker** and in **GitLab**.

## 1 - Build and Test Locally

Installation process:

- Install Python virtual environment if not `pip install virtualenv`
- Create a virtual environment `virtualenv venv --python=python3.10`
- Activate virtual environment `.\venv\scripts\activate.bat`
- Install dependencies `pip install -r requirements.txt`
- Deactivate virtual environment `(venv)> deactivate`
- Install javascript dependencies. In folder app/ run this command `npm install`

Software dependencies:

- fastapi
- uvicorn
- segysdk-python==`<latest version>`

Build and Test:

- set environment variable `SDMS_SERVICE_HOST` to the url of [seismic store service]
- run the filemetadata service: `python main.py`
- Open `http://localhost:8000/seismic-file-metadata/api/swagger-ui.html` in a web browser
- Enter bearer token (you can get it from Delfi Portal) and appkey for authorization
- Enter the sdpath i.e. `sd://<tenant>/<subproject>/test.sgy`

## 2 - Build and Test via Docker

Installation process:

- Build the docker image. `docker build -t seismic-metadata-image .`

Build and Test:

- Run the docker image. `docker run --env SDMS_SERVICE_HOST=<SDMS_SERVICE_HOST> -d -it --rm --name seismic-metadata-container -p 8080:8000 seismic-metadata-image`
Replace environment variable `<SDMS_SERVICE_HOST>` with the url of [seismic store service]

- Open `http://localhost:8080/seismic-file-metadata/api/swagger-ui.html` in a web browser
- Enter bearer token (you can get it from Delfi Portal) and appkey for authorization
- Enter the sdpath i.e. `sd://<tenant>/<subproject>/test.sgy`

## 3 - Build and Test in GitLab

- [CI/CD Pipeline](https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/-/pipelines)

- `SDMS_SERVICE_HOST` is defined in `devops\azure\chart\templates\configmap.yaml`

- [Test web url](https://osdu-glab.msft-osdu-test.org/seismic-file-metadata/api/swagger-ui.html)

## How To Run Unit Tests

- Navigate to `seismic-store-service/app/filemetadata/app`
- Run command `python -m unittest discover -s test -p "test_*" -v`

## How To Run Integration Tests

> ENV variables needed for CI/CD, `svctoken (eg. Bearer eyJ...)`, `LEGAL_TAG (eg. opendes-public-usa-dataset-7643990)`, `SVC_API_KEY (Working API key)`, `TENANT_NAME (eg. opendes)`, `DNS (Defaults to localhost and qa)`

- Navigate to `seismic-store-service/app/filemetadata/app/integration_test`
- Run command `python -m behave -v`
