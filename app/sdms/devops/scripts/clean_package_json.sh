#!/bin/bash
cd $directoryToScan

lines=$(cat ${currentDirectory}/unused.txt)
for line in $lines
do
  jq "del(.dependencies.\"${line}\")" package.json > cleaned_package.json
  mv cleaned_package.json package.json
  jq "del(.devDependencies.\"${line}\")" package.json > cleaned_package.json
  mv cleaned_package.json package.json
done

cat package.json

cd $currentDirectory