#!/bin/bash
cd $directoryToScan

FILES=$(mktemp)
PACKAGES=$(mktemp)

function check {
  cat package.json | jq "{} + .$1 | keys" | sed -n 's/.*"\(.*\)".*/\1/p' > $PACKAGES
  find . -type f -name '*.ts' > $FILES
  find . -type f -name 'package.json' >> $FILES
  while read PACKAGE
  do
    if ! grep -q $PACKAGE "devops/scripts/exclusions_detect_unused_packages.txt"
	then
      if [ -d "node_modules/${PACKAGE}" ]
	  then
        find node_modules/${PACKAGE} -type f -name '*.ts' >> $FILES
	    find node_modules/${PACKAGE} -type f -name 'package.json' >> $FILES
      fi
      RES=$(cat $FILES | xargs -I {} egrep -i "(import|from|require|loader|plugins|${PACKAGE}).*['\"](${PACKAGE}|.?\d+)[\"']" '{}' | wc -l)
      if [ $RES = 0 ]
      then
        echo -e "$PACKAGE"
      fi
	fi
  done < $PACKAGES
}

check "dependencies" > $currentDirectory/unused.txt
check "devDependencies" >> $currentDirectory/unused.txt
check "peerDependencies" >> $currentDirectory/unused.txt

cd $currentDirectory

cat unused.txt
