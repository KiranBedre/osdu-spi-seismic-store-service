# ============================================================================
# Copyright 2017-2019, Schlumberger
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

ARG docker_node_image_version=16-alpine

# -------------------------------
# Compilation stage
# -------------------------------
FROM node:${docker_node_image_version} as runtime-builder

# RUN apt-get install -yqq --no-install-recommends openssl

ADD ./ /service
WORKDIR /service
RUN apk --no-cache upgrade \
    && apk --no-cache add --virtual native-deps g++ openssl gcc libgcc libstdc++ linux-headers make python3 \
    && npm install --quiet node-gyp -g \
    && npm install --quiet \
    && npm run build \
    && mkdir artifact \
    && cp -r package.json npm-shrinkwrap.json dist artifact \
    && apk del native-deps

# -------------------------------
# Package stage
# -------------------------------
FROM node:${docker_node_image_version} as release

#Default to using self signed generated TLS cert
ENV USE_SELF_SIGNED_SSL_CERT true
ENV SSL_CERT_PATH "/src/cloud/providers/aws/certs/cert.crt" 
ENV SSL_KEY_PATH "/src/cloud/providers/aws/certs/cert.key"
ENV SSL_ENABLED "true"

COPY --from=runtime-builder /service/artifact /seistore-service
WORKDIR /seistore-service

RUN apk --no-cache upgrade \
    && apk --no-cache add --virtual native-deps g++ gcc libgcc libstdc++ linux-headers make python3 \
    && addgroup appgroup \
    && adduser --disabled-password --gecos --shell appuser --ingroup appgroup \
    && chown -R appuser:appgroup /seistore-service \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/npm' >> /etc/sudoers \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/node' >> /etc/sudoers \
    && npm install --production --quiet \
    && apk del native-deps

COPY src/cloud/providers/aws/build-aws/ssl.sh /seistore-service/ssl.sh
COPY src/cloud/providers/aws/build-aws/entrypoint.sh /seistore-service/entrypoint.sh
RUN chmod +x /seistore-service/ssl.sh
RUN chmod +x /seistore-service/entrypoint.sh
ENTRYPOINT ["/bin/sh", "-c", "/seistore-service/entrypoint.sh"]