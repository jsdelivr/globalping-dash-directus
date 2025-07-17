# Globalping dashboard directus

The backend part of the [Globalping dashboard](https://github.com/jsdelivr/globalping-dash).

## Contributing

To run this project, you need to have the following dependencies installed:
 - Docker
 - node.js
 - [`jq`](https://jqlang.org/) (used in some of the dev scripts)

You can run the project by following these steps:

1. Copy `.env.example` to `.env`
2. Copy `.env.development.example` to the `.env.development`
3. Register a [new OAuth app](https://github.com/settings/applications/new) on GitHub with values:

    Application name: Globalping dash directus local

    Homepage URL: http://localhost:18055

    Authorization callback URL: http://localhost:18055

    Enable Device Flow: disabled
5. Generate a new client secret for the app.
4. Add app id and generated secret to `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET` in `.env.development`
5. `pnpm i`
6. `docker compose up --build -d`
7. `corepack enable`
8. `pnpm init:dev`
9. Go to http://localhost:18055 and log in:
    - Using your GitHub account
    - As a regular user with lots of testing data using email `user@example.com` and password `user`
    - As a regular user with no data (fresh account) using email `newuser@example.com` and password `newuser`
    - As an admin using email `admin@example.com` and password `password`

### Updates

These commands should be enough in most cases:

```
pnpm run schema:apply
pnpm run migrate:dev
docker compose up --build -d
```

To refresh the seed data if needed:

```
pnpm run seed
```

## Prod first deploy

1. copy `.env.example` to `.env` and fulfill all empty values except `ADMIN_ACCESS_TOKEN`.
2. copy `.env.production.example` to the env vars of the container and fulfill all empty values except `AUTH_GITHUB_DEFAULT_ROLE_ID` and `AUTH_DISABLE_DEFAULT`.
3. run the remote container.
4. `pnpm run schema:apply`
5. `pnpm run migrate:prod`
6. get default role id and set it to the `AUTH_GITHUB_DEFAULT_ROLE_ID` env var
7. restart the container
8. login using github. Re-login as admin and give github user admin rights. Then set that value `AUTH_DISABLE_DEFAULT=true`. Then restart the container
9. Login using github. Generate a static access token for your user and save it to the local .env file as `ADMIN_ACCESS_TOKEN`

### Prod updates

1. fulfill all empty `.env` values, make sure ADMIN_ACCESS_TOKEN has your access token
2. if there are changes in `.env.production.example` copy them to the env vars of the container
3. `pnpm run schema:apply`. Restart is required after updating the schema (https://github.com/directus/directus/issues/17117)
4. `pnpm run migrate:prod`
5. stop prev container, run new container

## Commands

Create extension:

1. `npx --yes create-directus-extension@latest`
2. Run script from the extension folder to set up unit testing
```bash
original_dir=$PWD
pnpm add --save-dev chai @types/chai mocha @types/mocha sinon @types/sinon ts-node @directus/extensions @directus/types
jq --tab 'del(.compilerOptions.rootDir) | .compilerOptions.module = "ESNext" | .compilerOptions.resolveJsonModule = true | .include = ["./src/**/*.ts", "../../lib/**/*.ts", "./test/**/*.ts"]' tsconfig.json > temp.json && mv temp.json tsconfig.json
jq --tab '.scripts.test = "tsc --noEmit && NODE_ENV=test mocha"' package.json > temp.json && mv temp.json package.json
jq --tab '.scripts."test:dev" = "NODE_ENV=test TS_NODE_TRANSPILE_ONLY=true mocha"' package.json > temp.json && mv temp.json package.json
mkdir test
while [[ $PWD != */extensions ]]; do cd ..; done
cp ./operations/gh-webhook-handler/.mocharc.json "$original_dir/"
cp ./operations/gh-webhook-handler/wallaby.js "$original_dir/"
cd "$original_dir"
```

Fix wallaby.js in extensions that use `extensions/lib/`:

```bash
# From the extension folder call:
original_dir=$PWD
cd ../../lib/src
ln -s $PWD "$original_dir/lib"
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
    server server1 127.0.0.1:18055
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
