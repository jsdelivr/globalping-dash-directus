#!/bin/bash

CURRENT_BRANCH=${CURRENT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

# Remove the directory if it exists
if [ -d "test/e2e/globalping-dash" ]; then
  rm -rf test/e2e/globalping-dash
fi

# Clone the repository using the current branch, fallback to default branch if it fails
git clone -b $CURRENT_BRANCH https://github.com/jsdelivr/globalping-dash.git test/e2e/globalping-dash || git clone https://github.com/jsdelivr/globalping-dash.git test/e2e/globalping-dash

cd test/e2e/globalping-dash

# Install dependencies and build
pnpm install --ignore-workspace
dotenv -e ../../../.env -- pnpm build

cd ../../../
