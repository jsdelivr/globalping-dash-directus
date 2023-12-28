# dashboard

## Prod first deploy

- copy `.env.example` to `.env` and fulfill all empty values except `ADMIN_ACCESS_TOKEN`
- copy `.env.production.example` to the env vars of the container and fulfill all empty values except `AUTH_GITHUB_DEFAULT_ROLE_ID` and `AUTH_DISABLE_DEFAULT`
- run the remote container
- `npm run init`

## Prod other deploys

- fulfill all empty `.env` values, make sure ADMIN_ACCESS_TOKEN has your access token
- if there are changes in `.env.production.example` copy them to the env vars of the container
- `npm run migrate`
- `npm run schema:apply`. Restart is required after updating the schema (https://github.com/directus/directus/issues/17117)
- stop prev container, run new container

## Dev run

- copy `.env.example` to `.env` and fulfill all empty values except `ADMIN_ACCESS_TOKEN`
- copy `.env.development.example` to the `.env.development` and fulfill all empty values except `AUTH_GITHUB_DEFAULT_ROLE_ID` and `AUTH_DISABLE_DEFAULT`
- `docker compose up`
- `npm run init`

## Commands

Generate the schema:

`npx directus@latest schema snapshot --yes snapshots/collections-schema.yml`

Run migration:

`docker compose exec directus npx directus database migrate:latest`

Create extension:

`npx --yes create-directus-extension@latest`

Add tests to extension:
```bash
# From the extension folder call:
original_dir=$PWD
npm i --save-dev chai @types/chai mocha @types/mocha sinon @types/sinon ts-node
jq --tab '.compilerOptions.module = "ESNext"' tsconfig.json > temp.json && mv temp.json tsconfig.json
jq --tab '.scripts.test = "TS_NODE_TRANSPILE_ONLY=true mocha"' package.json > temp.json && mv temp.json package.json
mkdir test
while [[ $PWD != */extensions ]]; do cd ..; done # Go to the /src/extensions folder
cp ./gh-webhook-handler/.mocharc.json "$original_dir/"
cp ./gh-webhook-handler/wallaby.js "$original_dir/"
cd "$original_dir"
```

## Prepare dev host

```bash
# Install haproxy
sudo apt-get update
sudo apt -y install haproxy

# Configure and start haproxy
sudo chmod a+w /etc/haproxy/haproxy.cfg
cat <<EOF | sudo tee -a /etc/haproxy/haproxy.cfg > /dev/null
frontend gp_fe
    bind *:80
    default_backend gp_be

backend gp_be
    server server1 127.0.0.1:8055
EOF
sudo systemctl stop haproxy
sudo systemctl start haproxy

# Install node
sudo apt-get install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
NODE_MAJOR=18
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt-get update
sudo apt-get install nodejs -y

# Install docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install jq
apt install jq -y
```
