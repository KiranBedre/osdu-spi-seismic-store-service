# Introduction 
This project will provide the restful APIs to access SEGY file headers.

There are 3 ways to build and test this service: local, docker and GitLab.
# Local
## Getting Started
1.	Installation process
    - Install Python virtual environment if not
      `pip install virtualenv`
  
    - Create a virtual environment
      `virtualenv venv --python=python3.10`

    - Activate virtual environment
      `.\venv\scripts\activate.bat`

    - Install dependencies
      `pip install -r requirements.txt`
    
    - Deactivate virtual environment
      `(venv)> deactivate`

    - Install javascript dependencies. In folder app/ run this command
       `npm install`
    
2.	Software dependencies
    - fastapi
    - uvicorn
    - segysdk-python==`<latest version>`

3.	Latest releases
    
4.	API references

## Build and Test
1. set environment variable `SDMS_SERVICE_HOST` to the url of [seismic store service]

2. `python main.py`

3. Open `http://localhost:8000/seismic-file-metadata/api/swagger-ui.html` in web browser
    - Enter bearer token (you can get it from Delfi Portal) and appkey for authorization 
    - Enter sdpath i.e. `sd://opendes/dchentest/test.sgy`

# Docker
## Getting Started
1. Build the docker image. `docker build -t seismic-metadata-image . `

## Build and Test
1. Run the docker image. `docker run --env SDMS_SERVICE_HOST=<SDMS_SERVICE_HOST> -d -it --rm --name seismic-metadata-container -p 8080:8000 seismic-metadata-image`
Replace environment variable `<SDMS_SERVICE_HOST>` with the url of [seismic store service]

2. Open `http://localhost:8080/seismic-file-metadata/api/swagger-ui.html` in web browser
    - Enter bearer token (you can get it from Delfi Portal) and appkey for authorization 
    - Enter sdpath i.e. `sd://opendes/dchentest/test.sgy`

# GitLab
## Build and Test
1. [CI/CD Pipeline](https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/-/pipelines)

2. `SDMS_SERVICE_HOST` is defined in `devops\azure\chart\templates\configmap.yaml`

3. [Test web url](https://osdu-glab.msft-osdu-test.org/seismic-file-metadata/api/swagger-ui.html)

# Run Unit Tests

1. Navigate to `seismic-store-service/app/filemetadata/app`

2. Run command `python -m unittest discover -s test -p "test_*" -v`

# Run integration tests locally

> ENV variables needed for CI/CD, `svctoken (eg. Bearer eyJ...)`, `LEGAL_TAG (eg. opendes-public-usa-dataset-7643990)`, `SVC_API_KEY (Working API key)`, `TENANT_NAME (eg. opendes)`, `DNS (Defaults to localhost and qa)`

1. Navigate to `seismic-store-service/app/filemetadata/app/integration_test`

3. Run command `python -m behave -v`