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
mkdir -p ./extensions/directus-extension-token-value/
cp -rp ./src/extensions/token-value/* ./extensions/directus-extension-token-value/
