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


FILE_NAME1='pom.xml'
FILE_NAME2='MasterData3DInterpretationSetApi.java'
FILE_NAME3='MasterData2DInterpretationSetApi.java'
FILE_PATH1='./dist/java/'
FILE_PATH2='./dist/java/src/main/java/io/swagger/client/api/'
REG1='(<java.version>1.)(7)'
REG2='([[:space:].])(3dinterpretation)'
REG3='([[:space:].])(2dinterpretation)'
word1='\18'
word2='\1a\2'
replaceproblems() {
printf "%s\n" "Replacing problems in $2"
find $1$2 -type f -exec sed -i -r "s@$3@$4@g" {} \;

}
set -e
replaceproblems $FILE_PATH1 $FILE_NAME1 $REG1 $word1
replaceproblems $FILE_PATH2 $FILE_NAME2 $REG2 $word2
replaceproblems $FILE_PATH2 $FILE_NAME3 $REG3 $word2

printf "%s\n" "java patched successfully"