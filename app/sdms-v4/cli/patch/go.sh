#!/bin/bash

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

FOLDER_NAME1="./dist/go/api/"
FOLDER_NAME2="./dist/go/"
FILE_NAME1="swagger.yaml"
FILE_NAME2="api_master_data2_d_interpretation_set.go"
FILE_NAME3="api_master_data3_d_interpretation_set.go"
REG1='-\snull'
REG2='([[:space:].])(2dinterpretationset)'
REG3='([[:space:].])(3dinterpretationset)'
word1='\1a\2'

set -e

printf "%s\n" "Copying necessary files"
cp -r "./$MODELS_LOCAL_DIRECTORY" "$FOLDER_NAME" 

removeproblems() {
printf "%s\n" "Removing problems in $2"
sed -i "/$3/d" $1$2

}

replaceproblems() {
printf "%s\n" "Replacing problems in $2"
find $1$2 -type f -exec sed -i -r "s@$3@$4@g" {} \;

}

removeproblems $FOLDER_NAME1 $FILE_NAME1 $REG1
replaceproblems $FOLDER_NAME2 $FILE_NAME2 $REG2 $word1
replaceproblems $FOLDER_NAME2 $FILE_NAME3 $REG3 $word1

printf "%s\n" "go patched successfully"