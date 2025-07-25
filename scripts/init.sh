#!/bin/bash

source .env

set -e

function confirm {
    local message="$1"
    echo -e "$message Continue? [Y/n]"
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
  local token=$(curl -X POST -H "Content-Type: application/json" -d '{"email": "'"$ADMIN_EMAIL"'", "password": "'"$ADMIN_PASSWORD"'"}' $DIRECTUS_URL/auth/login | jq -r '.data.access_token')
  echo "$token"
}

if [[ ("$DIRECTUS_URL" != *"localhost"* && "$DIRECTUS_URL" != *"127.0.0.1"*) || ("$DB_HOST" != "localhost" && "$DB_HOST" != "127.0.0.1") ]]; then
	echo "Either DIRECTUS_URL or DB_HOST is not 'localhost' or '127.0.0.1'."
	exit 1
fi

if [ "$1" = "development" ]; then
  compose_file="docker-compose.yml"
elif [ "$1" = "e2e" ]; then
  compose_file="docker-compose.e2e.yml"
else
  echo "Error: Invalid argument. Usage: $0 {development|e2e}"
  exit 1
fi
echo "Compose file $compose_file is used."

./scripts/wait-for.sh -t 30 $DIRECTUS_URL/admin/login

token=$(get_token)

perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=$token/" .env

pnpm run schema:apply

pnpm run migrate:$1

user_role_id=$(curl -H "Authorization: Bearer $token" $DIRECTUS_URL/roles | jq -r '.data[] | select(.name == "User") | .id')

perl -pi -e "s/AUTH_GITHUB_DEFAULT_ROLE_ID=.*/AUTH_GITHUB_DEFAULT_ROLE_ID=$user_role_id/" ".env.$1"

pnpm run seed

docker compose --file "$compose_file" stop directus

docker compose --file "$compose_file" up -d directus

./scripts/wait-for.sh -t 30 $DIRECTUS_URL/admin/login

echo "Finished"
