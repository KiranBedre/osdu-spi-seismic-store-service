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

source ./patch/utils.sh

FILE_PATH="./dist/python/swagger_client/api/"
FILE_NAME1="master_data_2_d_interpretation_set_api.py"
FILE_NAME2="master_data_3_d_interpretation_set_api.py"
REG1="([[:space:].])(2dinterpretationset)"
REG2="([[:space:].])(3dinterpretationset)"
word1="\1a\2"

set -e

replaceProblems $FILE_PATH $FILE_NAME1 $REG1 $word1
replaceProblems $FILE_PATH $FILE_NAME2 $REG2 $word1
