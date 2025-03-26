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

ARG docker_node_image_version=18-alpine

FROM public.ecr.aws/docker/library/node:${docker_node_image_version} as runtime-builder

# RUN apt-get install -yqq --no-install-recommends openssl

ADD ./ /service
WORKDIR /service
RUN npm update -g
RUN apk --no-cache add --virtual native-deps g++ openssl gcc libgcc libstdc++ linux-headers make python3 \
    && npm install --quiet node-gyp -g \
    && npm install --quiet husky -g \
    && npm install --production --quiet \
    && npm run build 
RUN mkdir /seistore-service
RUN mv node_modules dist /seistore-service
RUN rm -rf /service

#Default to using self signed generated TLS cert
ENV USE_SELF_SIGNED_SSL_CERT true
ENV SSL_CERT_PATH "/src/cloud/providers/aws/certs/cert.crt" 
ENV SSL_KEY_PATH "/src/cloud/providers/aws/certs/cert.key"
ENV SSL_ENABLED "true"

WORKDIR /seistore-service

RUN addgroup appgroup \
    && adduser --disabled-password --gecos --shell appuser --ingroup appgroup

RUN chown -R appuser:appgroup /seistore-service \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/npm' >> /etc/sudoers \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/node' >> /etc/sudoers

COPY src/cloud/providers/aws/build-aws/ssl.sh /seistore-service/ssl.sh
COPY src/cloud/providers/aws/build-aws/entrypoint.sh /seistore-service/entrypoint.sh

RUN chmod +x /seistore-service/ssl.sh
RUN chmod +x /seistore-service/entrypoint.sh
ENTRYPOINT ["/bin/sh", "-c", "/seistore-service/entrypoint.sh"]