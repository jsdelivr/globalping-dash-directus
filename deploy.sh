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

echo "Stop previous run..."
docker-compose down

echo "Clear extensions folder..."
rm -rf ./extensions
mkdir -p ./extensions/displays/
mkdir -p ./extensions/endpoints/
mkdir -p ./extensions/hooks/
mkdir -p ./extensions/interfaces/
mkdir -p ./extensions/layouts/
mkdir -p ./extensions/migrations/
mkdir -p ./extensions/modules/
mkdir -p ./extensions/operations/
mkdir -p ./extensions/panels/

echo "Build and copy extensions..."
./build.sh

echo "Run..."
docker-compose up -d --build

echo "Wait for the service to start..."
./wait-for.sh -t 60 http://localhost:8055/admin/login

echo "Copy admin API key value to env file..."
confirm "Generate the API key and copy it to the ADMIN_ACCESS_TOKEN in env file."

echo "Restart..."
docker-compose down
docker-compose up -d --build

echo "Wait for the service to start..."
./wait-for.sh -t 60 http://localhost:8055/admin/login

echo "Apply tokens schema..."
docker-compose exec directus npx directus schema apply --yes /directus/snapshots/collections-schema.yml

echo "Run migrations..."
mkdir -p ./extensions/migrations/
cp -rp ./src/extensions/migrations/* ./extensions/migrations/
docker-compose exec directus npx directus database migrate:latest

echo "Copy AUTH_GITHUB_DEFAULT_ROLE_ID to env file..."
confirm "Copy the User role id to the AUTH_GITHUB_DEFAULT_ROLE_ID in env file."

echo "Restart..."
docker-compose down
docker-compose up -d --build

echo "Wait for the service to start..."
./wait-for.sh -t 60 http://localhost:8055/admin/login

echo "Switch to github user..."
confirm "Login using github, give yourself admin rights and set AUTH_DISABLE_DEFAULT to true in env file."

echo "Restart..."
docker-compose down
docker-compose up -d --build

echo "Wait for the service to start..."
./wait-for.sh -t 60 http://localhost:8055/admin/login
