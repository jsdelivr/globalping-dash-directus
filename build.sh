#!/bin/bash

set -e

# Save the current working directory
cwd=$(pwd)

# Build and copy hooks/tokens
cd ./src/extensions/hooks/tokens
npm i
npm run build
cd "$cwd"
mkdir -p ./extensions/hooks/tokens/
cp -rp ./src/extensions/hooks/tokens/dist/* ./extensions/hooks/tokens/

# Build and copy hooks/sign-up
cd ./src/extensions/hooks/sign-up
npm i
npm run build
cd "$cwd"
mkdir -p ./extensions/hooks/sign-up/
cp -rp ./src/extensions/hooks/sign-up/dist/* ./extensions/hooks/sign-up/

# Build and copy interfaces/token
cd ./src/extensions/interfaces/token
npm i
npm run build
cd "$cwd"
mkdir -p ./extensions/interfaces/token/
cp -rp ./src/extensions/interfaces/token/dist/* ./extensions/interfaces/token/

# Build and copy token-value
cd ./src/extensions/token-value
npm i
npm run build
cd "$cwd"
mkdir -p ./extensions/directus-extension-token-value/dist/
cp -rp ./src/extensions/token-value/dist/* ./extensions/directus-extension-token-value/dist/
cp -rp ./src/extensions/token-value/package.json ./extensions/directus-extension-token-value/

# Build and copy gh-webhook-handler
cd ./src/extensions/gh-webhook-handler
npm i
# npm run test
npm run build
cd "$cwd"
mkdir -p ./extensions/directus-extension-gh-webhook-handler/dist/
cp -rp ./src/extensions/gh-webhook-handler/dist/* ./extensions/directus-extension-gh-webhook-handler/dist/
cp -rp ./src/extensions/gh-webhook-handler/package.json ./extensions/directus-extension-gh-webhook-handler/

# Build and copy sponsors-cron-handler
cd ./src/extensions/sponsors-cron-handler
npm i
npm run build
cd "$cwd"
mkdir -p ./extensions/directus-extension-sponsors-cron-handler/dist/
cp -rp ./src/extensions/sponsors-cron-handler/dist/* ./extensions/directus-extension-sponsors-cron-handler/dist/
cp -rp ./src/extensions/sponsors-cron-handler/package.json ./extensions/directus-extension-sponsors-cron-handler/
