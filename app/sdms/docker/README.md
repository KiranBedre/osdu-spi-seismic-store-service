# Seismic Store Docker Images

This folder contains a set of [docker](https://www.docker.com/) images to build the micro-service and create the final distribution image

- `builder.Dockerfile`, creates the build image to use in the runtime.Docker to build the final distribution. The dockerfile requires 1 user parameter:

  - `nodesecure_version`: node package version from [nodesecure repo](https://github.com/nodesource/distributions) for example 8, 10 or 12 etc... (default=10).

  ```bash
  # execute this script from the repository root directory
  docker build -f .\docker\builder.Dockerfile -t <builder-image-name> --build-arg nodesecure_version=<node-version> .
  
  # example using ACR private registry
  az acr login -n <acr_name>
  docker build -f .\docker\builder.Dockerfile -t <acr_name>.azurecr.io/seistore-svc/<builder-image-name>:<builder-image-version> --build-arg nodesecure_version=<node-version> .
  ```

- `runtime.Dockerfile`, builds the distribution and create the final image to use in a runtime env. The dockerfile require 2 arguments:
  - `docker_builder_image`, a builder image to build the typescript service, it can be build  with the previous builder.Dockerfile image.
  - `docker_node_image_version`, the image version of the node docker image to use for the final distribution image. It must be capable to host and execute a nodejs application, for example **10.15.3**(default value) that corresponds to node:10.15.3

  ```bash
  # execute this script from the repository root directory
  docker build -f .\docker\builder.Dockerfile -t <runtime-image-name> --build-arg  docker_builder_image=<builder-image-name> --build-arg  docker_node_image_version=<node-image-version> .  
  # example using ACR private registry
  az acr login -n <acr_name>
  docker build -f .\docker\runtime.Dockerfile -t <acr_name>.azurecr.io/seistore-svc  <runtime-image-name>:<runtime-image-version> --build-arg  docker_builder_image=<acr_name>.azurecr.io/seistore-svc  <builder-image-name>:<builder-image-version> --build-arg  docker_node_image_version=<node-image-version> .
  ```
  