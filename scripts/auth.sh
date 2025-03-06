source .env

set -e

function get_token {
  local token=$(curl -X POST -H "Content-Type: application/json" -d '{"email": "'"$ADMIN_EMAIL"'", "password": "'"$ADMIN_PASSWORD"'"}' $DIRECTUS_URL/auth/login | jq -r '.data.access_token')
  echo "$token"
}

token=$(get_token)

perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=$token/" .env
