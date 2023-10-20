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
  local token=$(curl -X POST -H "Content-Type: application/json" -d '{"email": "'"$ADMIN_EMAIL"'", "password": "'"$ADMIN_PASSWORD"'"}' $DIRECTUS_URL/auth/login | jq -r '.data.access_token')
  echo "$token"
}

token=$(get_token)

perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=$token/" .env

npm run migrate

npm run schema:apply

confirm "Restart the container." # Required because of https://github.com/directus/directus/issues/17117

user_role_id=$(curl -H "Authorization: Bearer $token" $DIRECTUS_URL/roles | jq -r '.data[] | select(.name == "User") | .id')

confirm "Set that value to the container env vars: AUTH_GITHUB_DEFAULT_ROLE_ID=$user_role_id . Then restart the container."

confirm "Login using github. Re-login as admin and give github user admin rights. Then set that value to the container env vars: AUTH_DISABLE_DEFAULT=true . Then restart the container."

confirm "Login using github. Generate a static access token for your user and save it the local .env file as ADMIN_ACCESS_TOKEN"

echo "Finished"
