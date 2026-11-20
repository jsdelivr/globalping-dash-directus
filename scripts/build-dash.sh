#!/bin/bash

set -e

CURRENT_BRANCH=${CURRENT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}
REPO=https://github.com/jsdelivr/globalping-dash.git

# Use the branch with the same name, then the base branch of the pull request, then master.
for BRANCH in "$CURRENT_BRANCH" ${BASE_BRANCH:-} master; do
  git ls-remote --exit-code --heads "$REPO" "refs/heads/$BRANCH" > /dev/null && break
done

echo "globalping-dash branch: $BRANCH."

# Checkout and sync the branch if the directory exists, otherwise clone the repository
if [ -d "test/e2e/globalping-dash" ]; then
  cd test/e2e/globalping-dash
  git add .
  git reset --hard @{u}
  git fetch
  git checkout "$BRANCH"
  git reset --hard @{u}
else
  git clone -b "$BRANCH" "$REPO" test/e2e/globalping-dash
  cd test/e2e/globalping-dash
fi

# Install dependencies and build
pnpm install --ignore-workspace
dotenv -e ../../../.env.scripts.e2e -- pnpm build

cd ../../../
