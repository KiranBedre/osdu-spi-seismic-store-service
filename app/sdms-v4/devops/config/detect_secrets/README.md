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

1. Confirm file devops/config/detect_secrets/.secrets.baseline does not exist.
2. Run next command:

```bash
detect-secrets scan -C directory_to_scan > devops/config/detect_secrets/.secrets.baseline
```

###### Adding New Secrets to Baseline

This will re-scan your codebase, and:

1. Update/upgrade your baseline to be compatible with the latest version,
2. Add any new secrets it finds to your baseline,
3. Remove any secrets no longer in your codebase

This will also preserve any labelled secrets you have.

Remember to run this from root path of your project.

```bash
detect-secrets scan -C directory_to_scan --baseline .secrets.baseline
```

### CI

#### CI Requirements

Python

##### CI Usage

###### CI detected committed secrets

**Scanning tracked files:**

```bash
pip install detect-secrets
detect-secrets-hook --exclude-files devops/osdu/scanners/scan-for-secrets-node.yml --baseline devops/config/detect_secrets/.secrets.baseline $(git ls-files)
```

### Development

#### Dev Requirements

Python
PIP

##### Dev Usage

###### Dev detected secrets

**Scanning tracked files:**

```bash
pip install detect-secrets
detect-secrets-hook --exclude-files devops/osdu/scanners/scan-for-secrets-node.yml --baseline devops/config/detect_secrets/.secrets.baseline $(git ls-files)
```

##### False positives

Add next comment next to the line (in the proper file) that has been detected and is a false positives

```bash
pragma: allowlist nextline secret
```

##### Common issue

###### detect-secrets-hook: command not found

####### Cause

Another version of package detect-secrets is installed

####### Fix

Run next commands

```bash
npm uninstall -g detect-secrets
pip install detect-secrets
```
