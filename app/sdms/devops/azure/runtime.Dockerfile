# ============================================================================
# Copyright 2017-2021, Schlumberger
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ============================================================================

ARG NODEJS_VERSION=24.14
ARG NODEJS_DIGEST=sha256:2cb9bed9f0d2aba3d711b09da1ca62dd11ef594e0ae9b87352bb7eea34f3297c
ARG SEISMIC_DDMS_RELEASE_VERSION=2.0.0
ARG RUNTIME_ARTIFACT_STAGE=prebuilt-builder

FROM mcr.microsoft.com/azurelinux/base/nodejs:${NODEJS_VERSION}@${NODEJS_DIGEST} AS prebuilt-builder

COPY ./ /service
WORKDIR /service

RUN mkdir /artifact && \
    cp -a package.json npm-shrinkwrap.json dist node_modules /artifact/

FROM mcr.microsoft.com/azurelinux/base/nodejs:${NODEJS_VERSION}@${NODEJS_DIGEST} AS source-builder

ARG NPM_VERSION=11.19.0
COPY ./ /service
WORKDIR /service

RUN npm install --global "npm@${NPM_VERSION}" && \
    npm ci && \
    npm run build && \
    npm ci --omit=dev && \
    mkdir /artifact && \
    cp -a package.json npm-shrinkwrap.json dist node_modules /artifact/

FROM ${RUNTIME_ARTIFACT_STAGE} AS runtime-builder

FROM mcr.microsoft.com/azurelinux/base/nodejs:${NODEJS_VERSION}@${NODEJS_DIGEST} AS release

ARG SEISMIC_DDMS_RELEASE_VERSION
ENV NODE_ENV=production \
    VERSION=${SEISMIC_DDMS_RELEASE_VERSION}

RUN tdnf install -y libseccomp shadow-utils && \
    tdnf -y update && \
    tdnf clean all && \
    groupadd --system appgroup && \
    useradd --system --gid appgroup --home-dir /seistore-service --shell /sbin/nologin appuser && \
    rm -rf /usr/lib/node_modules/npm /usr/lib/node_modules/npx \
      /usr/local/lib/node_modules/npm \
      /usr/bin/npm /usr/bin/npx /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /seistore-service
COPY --from=runtime-builder --chown=appuser:appgroup /artifact/ ./

USER appuser:appgroup
EXPOSE 8080
ENTRYPOINT ["node", "--trace-warnings", "--trace-uncaught", "./dist/server/server-start.js"]
