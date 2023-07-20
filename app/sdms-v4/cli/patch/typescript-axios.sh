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

FILE_PATH1='./dist/typescript-axios/apis/'
FILE_PATH2='./dist/typescript-axios/models/'
FILE_NAME1='master-data2-dinterpretation-set-api.ts'
FILE_NAME2='master-data3-dinterpretation-set-api.ts'
FILE_NAME3='abstract-technical-assurance110.ts'
REG1='([[:space:].])(2dinterpretationset)'
REG2='([[:space:].])(3dinterpretationset)'
REG3='DataDefinitionsGeneratedabstractAbstractContact110Json'
REG4='data-definitions-generatedabstract-abstract-contact110-json'
word1='\1a\2'
word2='AbstractContact100'
word3='abstract-contact100'

replaceproblems() {
printf "%s\n" "Replacing problems in $2"
find $1$2 -type f -exec sed -i -r "s@$3@$4@g" {} \;

}
set -e
replaceproblems $FILE_PATH1 $FILE_NAME1 $REG1 $word1
replaceproblems $FILE_PATH1 $FILE_NAME2 $REG2 $word1
replaceproblems $FILE_PATH2 $FILE_NAME3 $REG3 $word2
replaceproblems $FILE_PATH2 $FILE_NAME3 $REG4 $word3

printf "%s\n" "typescript-axios patched successfully"