#!/bin/bash

# ***************************************************************************
# Copyright (c) 2018 Schlumberger. All Rights Reserved. Schlumberger Private.
# **************************************************************************

if [ ! -f ".gitignore" ]; then
    echo "[ERROR] The script must be called from the project root directory."
    exit 1
fi

if [ ! -f "docs/api/openapi.yaml" ]; then
    printf "\n%s\n" "docs/api/openapi.yaml not found (submodules not cloned)"
    exit 1
fi

npm run test-automation
if [ $? -ne 0 ]; then exit 1; fi
node devops/scripts/cssfix.js
if [ $? -ne 0 ]; then exit 1; fi

chmod 777 -R coverage
