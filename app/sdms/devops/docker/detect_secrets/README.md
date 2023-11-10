# Detect Secrets

[![Detect Secrets](https://travis-ci.com/Yelp/detect-secrets.svg?branch=master)](https://travis-ci.com/Yelp/detect-secrets)

## About

`detect-secrets` is an aptly named module for **detecting secrets** within a
code base.

## QuickStart

### Local environment

#### Python

Python required

##### Local installation

```bash
pip install detect-secrets
```

##### Local usage

###### Base files generation

This will generate the baseline file to be used by CI process:

1. Confirm file devops/docker/detect_secrets/.secrets.baseline does not exist.
2. From root path of the project run next command:

```bash
detect-secrets scan > devops/docker/detect_secrets/.secrets.baseline
```

###### Adding New Secrets to Baseline

This will re-scan your codebase, and:

1. Update/upgrade your baseline to be compatible with the latest version,
2. Add any new secrets it finds to your baseline,
3. Remove any secrets no longer in your codebase

This will also preserve any labelled secrets you have.

Remember to run this from root path of your project.

```bash
detect-secrets scan --baseline .secrets.baseline
```

#### Docker

Docker Required

##### Container installation

```bash
docker build -t detectsecrets .
```

##### Container usage

###### Base files generation with container

This will generate the baseline file to be used by CI process:

1. Confirm file devops/docker/detect_secrets/.secrets.baseline does not exist.
2. From root path of the project run next command:

```bash
docker run --rm -it -v $(pwd):/opt detectsecrets detect-secrets scan > /opt/devops/docker/detect_secrets/.secrets.baseline
```

###### Adding New Secrets to Baseline with container

This will re-scan your codebase, and:

1. Update/upgrade your baseline to be compatible with the latest version,
2. Add any new secrets it finds to your baseline,
3. Remove any secrets no longer in your codebase

This will also preserve any labelled secrets you have.

Remember to run this from root path of your project.

```bash
docker run --rm -it -v $(pwd):/opt detectsecrets detect-secrets scan --baseline /opt/devops/docker/detect_secrets/.secrets.baseline
```

### CI

#### Requirements

Docker Required

##### Image to be used

Image already has been built from the Dockerfile in this folder

```bash
community.opengroup.org:5555/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/seismic-store-service-detect-secrets:latest
```

##### Usage

###### Alerting off newly added secrets

**Scanning Staged Files Only:**

```bash
docker run --rm -it -v $(pwd):/opt community.opengroup.org:5555/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/seismic-store-service-detect-secrets:latest detect-secrets-hook --baseline /opt/devops/docker/detect_secrets/.secrets.baseline $(git diff --staged --name-only)
```

**Scanning All Tracked Files:**

```bash
docker run --rm -it -v $(pwd):/opt community.opengroup.org:5555/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/seismic-store-service-detect-secrets:latest detect-secrets-hook --baseline /opt/devops/docker/detect_secrets/.secrets.baseline $(git ls-files)
```

##### False positives

Add next comment above the line (in the proper file) that has been detected and is a false positives

```bash
pragma: allowlist nextline secret
```
