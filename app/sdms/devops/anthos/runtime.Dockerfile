# ============================================================================
# Copyright 2022 Google LLC
# Copyright 2022 EPAM Systems
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

ARG docker_node_builder_image_version=16.15-slim
ARG docker_node_image_version=14-alpine

# -------------------------------
# Compilation stage
# -------------------------------
FROM node:${docker_node_builder_image_version} as runtime-builder

ADD ./ /service
WORKDIR /service
COPY ./src/cloud/providers/anthos/schema.prisma /service/prisma/schema.prisma

RUN apt update \
    && apt install g++ gcc build-essential libstdc++6 make python3 -y \
    && npm install --quiet node-gyp -g \
    && npm install --quiet \
    && npm run build \
    && mkdir artifact \
    && cp -r package.json dist artifact 
# -------------------------------
# Package stage
# -------------------------------
FROM node:${docker_node_image_version} as release

COPY --from=runtime-builder /service/artifact /seistore-service
# do this only because the same path in package.json for prisma
COPY --from=runtime-builder /service/prisma/schema.prisma /seistore-service/src/cloud/providers/anthos/schema.prisma
WORKDIR /seistore-service

RUN ls

RUN apk --no-cache add --virtual native-deps g++ gcc libgcc libstdc++ linux-headers make python3 \
    && addgroup appgroup \
    && adduser --disabled-password --gecos --shell appuser --ingroup appgroup \
    && chown -R appuser:appgroup /seistore-service \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/npm' >> /etc/sudoers \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/node' >> /etc/sudoers \
    && npm install --production --quiet \
    && apk del native-deps \
    && apk add --update --no-cache openssl1.1-compat \
    && npx prisma generate --schema=/seistore-service/src/cloud/providers/anthos/schema.prisma


ENTRYPOINT ["node", "--trace-warnings", "--trace-uncaught", "./dist/server/server-start.js"]
