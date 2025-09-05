source .env

set -e

function get_token {
  local token=$(curl -X POST -H "Content-Type: application/json" -d '{"email": "'"$ADMIN_EMAIL"'", "password": "'"$ADMIN_PASSWORD"'"}' $DIRECTUS_URL/auth/login | jq -r '.data.access_token')
  echo "$token"
}

token=$(get_token)

if [ -z "$token" ] || [ "$token" == "null" ]; then
    echo "Error: Obtained token is empty: '$token'. Please check ADMIN_EMAIL and ADMIN_PASSWORD values in .env file."
    exit 1
fi

perl -pi -e "s/ADMIN_ACCESS_TOKEN=.*/ADMIN_ACCESS_TOKEN=$token/" .env
