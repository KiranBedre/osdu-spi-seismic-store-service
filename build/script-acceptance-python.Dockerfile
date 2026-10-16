# syntax=docker/dockerfile:1.24.0@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
# Canonical script-suite image for schema v4 Python/FastAPI services.
FROM docker.io/library/python:3.11-bookworm@sha256:5887f265d8d44d8b4734d3658b21d668edf5aaf92e4945bc0c984afbfab105d3

ARG SUITE_DIRS
ARG PIP_VERSION=25.2
WORKDIR /suite
COPY . /suite/
COPY --chmod=0755 build/script-acceptance-entrypoint.py /usr/local/bin/script-acceptance-entrypoint.py

RUN set -eu; \
    python -m pip install --no-cache-dir --upgrade "pip==${PIP_VERSION}"; \
    python -m pip install --no-cache-dir -r requirements.txt; \
    if [ -f requirements-tests.in ]; then \
      python -m pip install --no-cache-dir -c requirements.txt -r requirements-tests.in; \
    fi; \
    for dir in ${SUITE_DIRS:?SUITE_DIRS build-arg is required}; do \
      test -d "/suite/$dir"; \
    done; \
    printf '%s' "${SUITE_DIRS%% *}" > /suite/.default-suite-dir; \
    useradd --uid 1000 --create-home --shell /usr/sbin/nologin runner; \
    chown -R runner:runner /suite

ENV PYTHONPATH=/suite
USER runner
ENTRYPOINT ["python", "/usr/local/bin/script-acceptance-entrypoint.py"]
