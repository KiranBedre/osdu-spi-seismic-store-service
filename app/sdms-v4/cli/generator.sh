#!/bin/bash
# ============================================================================
# Copyright 2017-2023, Schlumberger
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

# get the current script directory
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# check and set runtime variables
if [ -z ${YAML_INPUT_FILE} ]; then 
    YAML_INPUT_FILE='../dist/docs/openapi.yaml'
fi
if [ -z ${YAML_OUTPUT_FILE} ]; then 
    YAML_OUTPUT_FILE='cli-openapi.yaml'
fi
if [ -z ${MODELS_SOURCE_REPOSITORY} ]; then 
    MODELS_SOURCE_REPOSITORY='https://community.opengroup.org/osdu/data/data-definitions/-/archive/master/data-definitions-master.zip'
fi
if [ -z ${MODELS_OUTPUT_ZIP} ]; then 
    MODELS_OUTPUT_ZIP='data-definitions-master.zip'
fi
if [ -z ${MODELS_LOCAL_DIRECTORY} ]; then 
    export MODELS_LOCAL_DIRECTORY='data-definitions' 
fi
if [ -z ${SWAGGER_CODEGEN_CLI_VERSION} ]; then 
    SWAGGER_CODEGEN_CLI_VERSION='3.0.46' 
fi

# print execution configurations
printf "\n%s\n" "--------------------------------------------"
printf "%s\n" "Seismic DMS V4 Client Libraries Generator"
printf "%s\n" "--------------------------------------------"
printf "%s\n" "yaml input file path = ${YAML_INPUT_FILE}"
printf "%s\n" "yaml output file path = ${SCRIPT_DIR}/${YAML_OUTPUT_FILE}"
printf "%s\n" "models source repository = ${MODELS_SOURCE_REPOSITORY}"
printf "%s\n" "models output zip file name= ${MODELS_OUTPUT_ZIP}"
printf "%s\n" "models local directory path = ${SCRIPT_DIR}/${MODELS_LOCAL_DIRECTORY}"
printf "\n%s\n" "--------------------------------------------"
printf "%s\n" "Initialize Required Software"
printf "%s\n" "--------------------------------------------"

# move into script directory
cd $SCRIPT_DIR

# copy original yaml file to the client directory
if [ -f $YAML_INPUT_FILE ]; then
    cp $YAML_INPUT_FILE $YAML_OUTPUT_FILE
else
    cd ..
    npm install
    npm run build
    cd $SCRIPT_DIR
    cp $YAML_INPUT_FILE $YAML_OUTPUT_FILE
fi

# check if java is installed in the system
if ! command -v java &> /dev/null; then
    echo "[ERROR] Java is required to execute the cli-generator script but it has not be found in the system."
    exit 1
else 
    echo "Check if Java software is installed in the system: OK"
fi

# check if swagger-cli is installed in the system
# if ! command -v swagger-cli &> /dev/null; then
#     echo "[ERROR] swagger-cli is required to execute the cli-generator script but it has not be found in the system."
#     exit 1
# else 
#     echo "Check if swagger-cli module is installed in the system: OK"
# fi

# check if openapi-generator-cli is installed in the system
# if ! command -v openapi-generator-cli &> /dev/null; then
#     echo "[ERROR] openapi-generator-cli is required to execute the cli-generator script but it has not be found in the system."
#     exit 1
# else 
#     echo "Check if openapi-generator-cli module is installed in the system: OK"
# fi

# check if swagger-codegen-cli is installed in the system otherwise download it
SWAGGER_CLI_CODEGEN_JAR=swagger-codegen-cli.jar
if ! [ -f $SWAGGER_CLI_CODEGEN_JAR ]; then 
    printf "%s\n" "Check if swagger-codegen-cli-${SWAGGER_CODEGEN_CLI_VERSION} software is installed in the system: NO"
    printf "%s\n" "Download the required software swagger-codegen-cli-${SWAGGER_CODEGEN_CLI_VERSION}"
    wget -q --show-progress https://repo1.maven.org/maven2/io/swagger/codegen/v3/swagger-codegen-cli/${SWAGGER_CODEGEN_CLI_VERSION}/swagger-codegen-cli-${SWAGGER_CODEGEN_CLI_VERSION}.jar -O $SWAGGER_CLI_CODEGEN_JAR
else
    printf "%s\n" "Check if swagger-codegen-cli-${SWAGGER_CODEGEN_CLI_VERSION} software is installed in the system: OK"
fi

# clone necessary data models from data definition source repository
printf "%s\n" "Download data models sources from GitLab repository"
wget -q --show-progress $MODELS_SOURCE_REPOSITORY -O $MODELS_OUTPUT_ZIP
printf "%s\n" "Extract downloaded archive"
MODEL_OUTPUT_ZIP_FOLDER=$(echo "$MODELS_OUTPUT_ZIP" | sed -e "s/.zip$//")
unzip -q $MODELS_OUTPUT_ZIP
mkdir -p $MODELS_LOCAL_DIRECTORY
mv $MODEL_OUTPUT_ZIP_FOLDER'/Examples' data-definitions
mv $MODEL_OUTPUT_ZIP_FOLDER'/Generated' data-definitions

# replace external model references with local references in copied yaml file
printf "%s\n" "Replace external model reference with local references in the yaml file"
word1="https://community.opengroup.org/osdu/data/data-definitions/-/raw/master/"
word2=./${MODELS_LOCAL_DIRECTORY}/
find $YAML_OUTPUT_FILE -type f -exec sed -i "s@$word1@$word2@g" {} \;

# create client libraries for different languages
printf "\n%s\n" "--------------------------------------------"
printf "%s\n" "Generate Client Libraries"
printf "%s\n" "--------------------------------------------"
mkdir -p ./dist
declare -a languages=(
    [0]=typescript-axios
    # [1]=go
    # [2]=java
    # [3]=python
)
for i in "${languages[@]}"
do
    printf "%s\n" "Generate $i client library"
    java -jar $SWAGGER_CLI_CODEGEN_JAR generate -i $YAML_OUTPUT_FILE -l $i -o ./dist/$i
    echo "chmod +x ./patch/$i.sh" | /bin/bash
    echo "./patch/$i.sh" | /bin/bash
    printf "%s\n" "$i patched successfully"
    printf "%s\n" "--------------------------------------------"
done

# cpp library must be generated separately
# printf "%s\n" "Generate C++ client library"
# swagger-cli bundle $YAML_OUTPUT_FILE --outfile bundled.yaml
# openapi-generator-cli  generate --skip-validate-spec -i bundled.yaml -g cpp-qt-client -o ./dist/cpp-qt-client

# cleanup
# rm openapitools.json
# rm bundled.yaml
rm $YAML_OUTPUT_FILE
rm $SWAGGER_CLI_CODEGEN_JAR
rm $MODELS_OUTPUT_ZIP
rm -rf $MODEL_OUTPUT_ZIP_FOLDER
rm -rf $MODELS_LOCAL_DIRECTORY