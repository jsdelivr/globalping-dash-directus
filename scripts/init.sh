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
project_name=dash-directus

while [[ $# -gt 0 ]]; do
  case $1 in
    -p|--project-name)
      project_name="$2"
      shift # past argument
      shift # past value
      ;;
    --dev)
      is_dev_mode=true
      shift # past argument
      ;;
    -*|--*)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

./scripts/wait-for.sh -t 10 $DIRECTUS_URL/admin/login

token=$(get_token)

perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=$token/" .env

npm run schema:apply

npm run migrate

user_role_id=$(curl -H "Authorization: Bearer $token" $DIRECTUS_URL/roles | jq -r '.data[] | select(.name == "User") | .id')

if [ "$is_dev_mode" = true ]; then
	if [[ "$DIRECTUS_URL" != *"localhost"* || "$DB_HOST" != "localhost" ]]; then
    	echo "Either DIRECTUS_URL or DB_HOST is not 'localhost'."
        exit 1
	fi

	perl -pi -e "s/AUTH_GITHUB_DEFAULT_ROLE_ID=.*/AUTH_GITHUB_DEFAULT_ROLE_ID=$user_role_id/" .env.development

	docker compose --project-name "$project_name" stop directus

	docker compose --project-name "$project_name" start directus

	./scripts/wait-for.sh -t 10 $DIRECTUS_URL/admin/login

	npm run seed
else
	confirm "Set that value to the container env vars: \nAUTH_GITHUB_DEFAULT_ROLE_ID=$user_role_id \nThen restart the container." # Restart is requred to apply new role id and because of https://github.com/directus/directus/issues/17117

	confirm "Login using github. Re-login as admin and give github user admin rights. Then set that value to the container env vars: \nAUTH_DISABLE_DEFAULT=true \nThen restart the container."

	confirm "Login using github. Generate a static access token for your user and save it to the local .env file as ADMIN_ACCESS_TOKEN"
fi

echo "Finished"
