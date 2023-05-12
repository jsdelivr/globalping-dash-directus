#!/bin/bash

set -e

function confirm {
    local message="$1"
    echo "$message Continue? [Y/n]"
    read confirm

    if [ "$confirm" == "n" ] || [ "$confirm" == "N" ]; then
        echo "Aborting script..."
        exit 1
    elif [ -z "$confirm" ] || [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
        confirm="y"
    else
        echo "Invalid input. Aborting script..."
        exit 1
    fi
}

# Stop previous run
docker-compose down

rm -rf ./extensions

# Build and copy extensions
./build.sh

# Run
docker-compose up -d --build

# Wait for the service to start
./wait-for.sh -t 60 http://localhost:8055/admin/login

# Copy admin API key value to env file
confirm "Generate the API key and copy it to the ADMIN_ACCESS_TOKEN in env file."

# Restart
docker-compose down
docker-compose up -d --build

# Wait for the service to start
./wait-for.sh -t 60 http://localhost:8055/admin/login

# Run migrations
mkdir -p ./extensions/migrations/
cp -rp ./src/extensions/migrations/ ./extensions/migrations/
docker-compose exec directus npx directus database migrate:latest

# Copy AUTH_GITHUB_DEFAULT_ROLE_ID to env file
confirm "Copy the User role id to the AUTH_GITHUB_DEFAULT_ROLE_ID in env file."

# Apply tokens schema
docker-compose exec directus npx directus schema apply --yes /directus/snapshots/collections-schema.yml

# Set AUTH_DISABLE_DEFAULT to true
confirm "Set AUTH_DISABLE_DEFAULT to true in env file."

# Restart
docker-compose down
docker-compose up -d --build

# Wait for the service to start
./wait-for.sh -t 60 http://localhost:8055/admin/login
