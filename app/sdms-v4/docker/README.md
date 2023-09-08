# Seismic Store Docker Images #

This folder contain a [docker](https://www.docker.com/) create the final 
distribution image

- `runtime.Dockerfile`, builds the distribution and create the final image to
use in a runtime env. The dockerfile require 1 argument:
  - `docker_node_image_version`, the image version of the node docker image to
use for the final distribution image. It must be capable to host and execute a 
nodejs application, for example **10.15.3**(default value) that corresponds to node:10.15.3

  ```bash
  # execute this script from the repository root directory
  docker build -f .\docker\builder.Dockerfile -t <runtime-image-name> --build-arg  docker_node_image_version=<node-image-version> .  
  # example using ACR private registry
  az acr login -n <acr_name>
  docker build -f .\docker\runtime.Dockerfile -t <acr_name>.azurecr.io/seistore-svc-v4  <runtime-image-name>:<runtime-image-version> <builder-image-name>:<builder-image-version> .
  ```
  