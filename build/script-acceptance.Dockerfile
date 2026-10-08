# syntax=docker/dockerfile:1.24.0@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
# Canonical script-suite image for schema v4 Node/TypeScript services.
FROM docker.io/library/alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8 AS select
ARG SUITE_DIRS
COPY . /src/
RUN set -eu; mkdir -p /suite; \
    for dir in ${SUITE_DIRS:?SUITE_DIRS build-arg is required}; do \
      mkdir -p "/suite/$dir"; cp -R "/src/$dir/." "/suite/$dir/"; \
    done; \
    printf '%s' "${SUITE_DIRS%% *}" > /suite/.default-suite-dir

FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392

ARG SUITE_DIRS
WORKDIR /suite
COPY --from=select /suite/ /suite/
COPY --chmod=0755 build/script-acceptance-entrypoint.js /usr/local/bin/script-acceptance-entrypoint.js

RUN set -eu; \
    for dir in ${SUITE_DIRS:?SUITE_DIRS build-arg is required}; do \
      if [ -f "/suite/$dir/package-lock.json" ] || [ -f "/suite/$dir/npm-shrinkwrap.json" ]; then \
        npm --prefix "/suite/$dir" ci; \
      elif [ -f "/suite/$dir/package.json" ]; then \
        echo "suite $dir has package.json but no npm lockfile" >&2; exit 2; \
      fi; \
    done; \
    chown -R node:node /suite

USER node
ENTRYPOINT ["node", "/usr/local/bin/script-acceptance-entrypoint.js"]
