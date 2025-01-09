#!/bin/bash

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Checkout and sync the branch if the directory exists, otherwise clone the repository
if [ -d "test/e2e/globalping-dash" ]; then
  cd test/e2e/globalping-dash
	git add .
  git reset --hard @{u}
	git fetch
  git checkout $CURRENT_BRANCH || git checkout master
  git reset --hard @{u}
else
  git clone -b $CURRENT_BRANCH https://github.com/jsdelivr/globalping-dash.git test/e2e/globalping-dash || git clone https://github.com/jsdelivr/globalping-dash.git test/e2e/globalping-dash
  cd test/e2e/globalping-dash
fi

# Install dependencies and build
pnpm install --ignore-workspace
dotenv -e ../../../.env -- pnpm build

cd ../../../
