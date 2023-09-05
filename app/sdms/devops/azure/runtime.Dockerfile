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

ARG docker_node_image_version=14-alpine

# -------------------------------
# Compilation stage
# -------------------------------
FROM mcr.microsoft.com/mirror/docker/library/node:${docker_node_image_version} as runtime-builder

ADD ./ /service
WORKDIR /service
RUN apk --no-cache add --virtual native-deps g++ gcc libgcc libstdc++ linux-headers make python3 \
    && npm install --quiet node-gyp -g \
    && npm install --quiet \
    && npm run build \
    && mkdir artifact \
    && cp -r package.json npm-shrinkwrap.json dist artifact \
    && apk del native-deps

# -------------------------------
# Package stage
# -------------------------------
FROM mcr.microsoft.com/mirror/docker/library/node:${docker_node_image_version} as release

COPY --from=runtime-builder /service/artifact /seistore-service
WORKDIR /seistore-service

RUN apk update && apk upgrade
RUN apk --no-cache add --virtual native-deps g++ gcc libgcc libstdc++ linux-headers make python3 \
    && addgroup appgroup \
    && adduser --disabled-password --gecos --shell appuser --ingroup appgroup \
    && chown -R appuser:appgroup /seistore-service \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/npm' >> /etc/sudoers \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/node' >> /etc/sudoers \
    && npm install --production --quiet \
    && apk del native-deps

ENTRYPOINT ["node", "--trace-warnings", "--trace-uncaught", "./dist/server/server-start.js"]
