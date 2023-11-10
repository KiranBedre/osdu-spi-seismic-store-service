#!/bin/bash
#  ***************************************************************************
#  Copyright 2017 - 2023, Schlumberger
#
#  Licensed under the Apache License, Version 2.0(the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#  ***************************************************************************

install_package() {
    npm list -g | grep $1 > /dev/null 2>&1
    if [ $? == 1 ]; then
        echo $1": software not found, installing..."
        npm install -g $1
    else
        echo $1": ok"
    fi
}

check_exit() {
    if [ $1 == 1 ]; then
        echo ""
        echo "ERROR: code quality check analysis failed"
        exit 1
    fi
}

# install required package to execute code quality check analysis
printf "\n%s\n" "-------------------------------------------------------"
echo "check and install required quality tools"
printf "%s\n" "-------------------------------------------------------"
install_package markdownlint-cli2
install_package cspell
install_package scan-for-secrets

# lint all markdown documents
printf "\n%s\n" "-------------------------------------------------------"
echo "markdown linting"
printf "%s\n" "-------------------------------------------------------"
npx markdownlint-cli2 "**/*.md" "#**/node_modules" --config .markdownlint.json
check_exit $?

# printf "\n%s\n" "-------------------------------------------------------"
# echo "code linting"
# printf "%s\n" "-------------------------------------------------------"
# npm run lint

# printf "%s\n" "-------------------------------------------------------"
# echo "code formatting"
# printf "%s\n" "-------------------------------------------------------"
# npm run prettier

# run code spell
printf "\n%s\n" "-------------------------------------------------------"
echo "spelling check"
printf "%s\n" "-------------------------------------------------------"
npx cspell --no-progress --show-suggestions .
check_exit $?

# scan for secrets
printf "\n%s\n" "-------------------------------------------------------"
echo "scan for secrets"
printf "%s\n" "-------------------------------------------------------"
echo "SDMS V3"
rm -rf app/sdms/src/cloud/providers/azure/sidecar/src/Sidecar.Common/bin
rm -rf app/sdms/src/cloud/providers/azure/sidecar/src/Sidecar.DeleteOperationRunner/bin
rm -rf app/sdms/src/cloud/providers/azure/sidecar/src/Sidecar.QueryRunner/bin
rm -rf app/sdms/src/cloud/providers/azure/sidecar/test/Sidecar.Common.Tests/bin
rm -rf app/sdms/src/cloud/providers/azure/sidecar/test/Sidecar.DeleteOperationRunner.Tests/bin
rm -rf app/sdms/src/cloud/providers/azure/sidecar/src/Sidecar.Common/obj
rm -rf app/sdms/src/cloud/providers/azure/sidecar/src/Sidecar.DeleteOperationRunner/obj
rm -rf app/sdms/src/cloud/providers/azure/sidecar/src/Sidecar.QueryRunner/obj
rm -rf app/sdms/src/cloud/providers/azure/sidecar/test/Sidecar.Common.Tests/obj
rm -rf app/sdms/src/cloud/providers/azure/sidecar/test/Sidecar.DeleteOperationRunner.Tests/obj
npx scan-for-secrets app/sdms/src
check_exit $?
echo ""
echo "SDMS V4"
npx scan-for-secrets app/sdms-v4/src
check_exit $?
echo ""
echo "FileMetadata"
npx scan-for-secrets app/filemetadata/app
check_exit $?

# lint .Net code
printf "\n%s\n" "-------------------------------------------------------"
echo "lint .NET"
printf "%s\n" "-------------------------------------------------------"
if [ -x "$(command -v dotnet)" ]; then
    currentPath=$(pwd)
    cd app/sdms/src/cloud/providers/azure/sidecar/
    echo "check sdms sidecar code format"
    dotnet format --verify-no-changes
    check_exit $?
    # echo "run sdms sidecar unit test"
    # dotnet test
    # check_exit $?
    cd $currentPath
else
    echo "dotnet not found, code format check skipped"
fi
