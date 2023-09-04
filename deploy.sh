#!/bin/bash

source .env

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

function get_token {
  local token=$(curl -X POST -H "Content-Type: application/json" -d '{"email": "'"$ADMIN_EMAIL"'", "password": "'"$ADMIN_PASSWORD"'"}' http://localhost:8055/auth/login | jq -r '.data.access_token')
  echo "$token"
}

echo "Resetting .env file..."
perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=/" .env
perl -pi -e "s/AUTH_GITHUB_DEFAULT_ROLE_ID=.*/AUTH_GITHUB_DEFAULT_ROLE_ID=/" .env
perl -pi -e "s/AUTH_DISABLE_DEFAULT=.*/AUTH_DISABLE_DEFAULT=false/" .env

echo "Stopping previous run..."
docker-compose down

echo "Clearing extensions folder..."
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

echo "Building and copy extensions..."
./build.sh

echo "Running..."
docker-compose up -d --build

echo "Waiting for the service to start..."
./sh-scripts/wait-for.sh -t 60 http://localhost:8055/admin/login

echo "Generating the API key and copy to env file..."
token=$(get_token)
perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=$token/" .env

echo "Restarting..."
docker-compose down
docker-compose up -d --build

echo "Waiting for the service to start..."
./sh-scripts/wait-for.sh -t 60 http://localhost:8055/admin/login

echo "Applying tokens schema..."
docker-compose exec directus npx directus schema apply --yes /directus/snapshots/collections-schema.yml

echo "Running migrations..."
mkdir -p ./extensions/migrations/
cp -rp ./src/extensions/migrations/* ./extensions/migrations/
docker-compose exec directus npx directus database migrate:latest

echo "Getting AUTH_GITHUB_DEFAULT_ROLE_ID and copy to env file..."
token=$(get_token)
user_role_id=$(curl -H "Authorization: Bearer $token" http://localhost:8055/roles | jq -r '.data[] | select(.name == "User") | .id')
perl -pi -e "s/AUTH_GITHUB_DEFAULT_ROLE_ID=.*/AUTH_GITHUB_DEFAULT_ROLE_ID=$user_role_id/" .env

echo "Restarting..."
docker-compose down
docker-compose up -d --build

echo "Waiting for the service to start..."
./sh-scripts/wait-for.sh -t 60 http://localhost:8055/admin/login

echo "Switching to github user..."
confirm "Login using github. Re-login as admin and give github user admin rights. Then set AUTH_DISABLE_DEFAULT to true in env file."

echo "Restarting..."
docker-compose down
docker-compose up -d --build

echo "Waiting for the service to start..."
./sh-scripts/wait-for.sh -t 60 http://localhost:8055/admin/login

echo "Finished!"
