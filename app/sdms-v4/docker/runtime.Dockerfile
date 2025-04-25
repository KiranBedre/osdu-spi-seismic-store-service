# ============================================================================
# Copyright 2017-2022, Schlumberger
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

FROM node:${docker_node_image_version} as release

ADD ./ /service
WORKDIR /service

RUN npm update -g
RUN apk --no-cache add --virtual binutils=2.43.1-r2 libexpat=2.7.0-r0 python python3 xz-libs=5.6.3-r1\
    && npm install --quiet node-gyp -g \
    && npm install --quiet husky -g \
    && npm install --production --quiet \
    && npm run build
RUN mkdir /seistore-service
RUN mv node_modules dist /seistore-service
RUN rm -rf /service

WORKDIR /seistore-service

RUN addgroup appgroup \
    && adduser --disabled-password --gecos --shell appuser --ingroup appgroup \
    && chown -R appuser:appgroup /seistore-service \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/npm' >> /etc/sudoers \
    && echo '%appgroup ALL=(ALL) NOPASSWD: /usr/bin/node' >> /etc/sudoers
    
ENTRYPOINT ["node", "--trace-warnings", "--trace-uncaught", "./dist/server/server-start.js"]
