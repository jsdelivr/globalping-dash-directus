#!/bin/bash

# Save the current working directory
cwd=$(pwd)

# Build and copy hooks/tokens
cd ./src/extensions/hooks/tokens
npm run build
cd "$cwd"
mkdir -p ./extensions/hooks/tokens/
cp -rp ./src/extensions/hooks/tokens/dist/ ./extensions/hooks/tokens/

# Build and copy interfaces/token
cd ./src/extensions/interfaces/token
npm run build
cd "$cwd"
mkdir -p ./extensions/interfaces/token/
cp -rp ./src/extensions/interfaces/token/dist/ ./extensions/interfaces/token/

# Build and copy token-value
cd ./src/extensions/token-value
npm run build
cd "$cwd"
mkdir -p ./extensions/directus-extension-token-value/
cp -rp ./src/extensions/token-value/ ./extensions/directus-extension-token-value/
