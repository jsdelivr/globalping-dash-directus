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

is_dev_mode=false

for arg in "$@"
do
    if [ "$arg" = "--dev" ]; then
        is_dev_mode=true
        break
    fi
done

token=$(get_token)

perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=$token/" .env

npm run schema:apply

npm run migrate

user_role_id=$(curl -H "Authorization: Bearer $token" $DIRECTUS_URL/roles | jq -r '.data[] | select(.name == "User") | .id')

if [ "$is_dev_mode" = true ]; then
	echo "user_role_id=$user_role_id"

	perl -pi -e "s/AUTH_GITHUB_DEFAULT_ROLE_ID=.*/AUTH_GITHUB_DEFAULT_ROLE_ID=$user_role_id/" .env.development

	docker compose stop directus

	docker compose up -d directus

	./scripts/wait-for.sh -t 60 http://localhost:8055/admin/login
else
	confirm "Set that value to the container env vars: \nAUTH_GITHUB_DEFAULT_ROLE_ID=$user_role_id \nThen restart the container." # Restart is requred to apply new role id and because of https://github.com/directus/directus/issues/17117

	confirm "Login using github. Re-login as admin and give github user admin rights. Then set that value to the container env vars: \nAUTH_DISABLE_DEFAULT=true \nThen restart the container."

	confirm "Login using github. Generate a static access token for your user and save it the local .env file as ADMIN_ACCESS_TOKEN"
fi

echo "Finished"
