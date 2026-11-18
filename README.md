# Globalping dashboard directus

The backend part of the [Globalping dashboard](https://github.com/jsdelivr/globalping-dash).

## Contributing

To run this project, you need to have the following dependencies installed:
 - Docker
 - node.js
 - [`jq`](https://jqlang.org/) (used in some of the dev scripts)

You can run the project by following these steps:

1. Copy `.env.scripts.development.example` to `.env.scripts.development`
2. Copy `.env.docker.development.example` to the `.env.docker.development`
3. Register a [new OAuth app](https://github.com/settings/applications/new) on GitHub with values:

    Application name: Globalping dash directus local

    Homepage URL: http://localhost:18055

    Authorization callback URL: http://localhost:18055

    Enable Device Flow: disabled
5. Generate a new client secret for the app.
4. Add app id and generated secret to `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET` in `.env.docker.development`
5. `pnpm i`
6. `docker compose up --build -d`
7. `corepack enable`
8. `pnpm init:dev`
9. Go to http://localhost:18055 and log in using your GitHub account or one of the [development accounts](#development-accounts).

### Development accounts

The development seeds provide four logins. Use the regular user for normal dashboard development; organization roles apply per organization, independently of the Directus administrator role.

| Email | Password | GitHub username | Purpose |
| --- | --- | --- | --- |
| `user@example.com` | `user` | `john` | Populated personal account; admin, member and viewer scenarios across organizations |
| `teammate@example.com` | `user` | `teammate` | Another regular user; second-admin actions and other users' items |
| `newuser@example.com` | `newuser` | `turk` | Fresh user and onboarding; no organizations, probes, credits/history, API tokens or app approvals |
| `admin@example.com` | `password` | — | Directus administration |

The regular user and teammate start in their personal accounts, with their populated organizations selected. `unclaimed-org` starts unselected; select it when testing the first contribution/claim flow. The fresh user has no default account selected, so onboarding opens on login.

| Organization | Regular user (`john`) | Teammate | Initial data |
| --- | --- | --- | --- |
| `admin-org` | Admin | Admin | Populated, public, sponsor; profile and legacy adoption tokens |
| `member-org` | Member | Admin | Populated, private; redirected sponsorship example |
| `viewer-org` | Viewer | Admin | Populated, private; read-only role for the regular user |
| `unclaimed-org` | Member | Not a member | Empty and without an admin; first contribution/claim scenarios |

Populated organizations contain probes, API tokens, app approvals and credit history. The teammate also has personal items; the regular user's larger personal dataset comes from the earlier seeds. After transferring data or claiming `unclaimed-org`, reseed to restore the initial scenarios.

Two additional user records, `test-manual-additions-production` and `test-manual-additions-staging`, are non-login recipients for manual-credit examples. They have no email/password and stay separate because refreshing those examples resets their credit history. These six development user records are separate from the internal System service user created by migrations. Unlinked sponsor/recipient identities and legacy adoption-token usernames are metadata, not extra logins. E2E tests generate and clean up their own users and organizations.

### Updates

These commands should be enough in most cases:

```
pnpm run schema:apply:development
pnpm run migrate:development
docker compose up --build -d
```

To restore the development accounts and seed data:

```
pnpm run seed:development
```

This resets local application data and removes non-admin users, including accounts created through GitHub login. Use it only on a disposable development database.

## Prod first deploy

1. copy `.env.scripts.development.example` to `.env.scripts.production` and fulfill all empty values except `ADMIN_ACCESS_TOKEN`.
2. copy `.env.docker.production.example` to the env vars of the container and fulfill all empty values except `AUTH_GITHUB_DEFAULT_ROLE_ID`.
3. run the remote container.
4. `pnpm run schema:apply:production`
5. `pnpm run migrate:production`
6. get default role id and set it to the `AUTH_GITHUB_DEFAULT_ROLE_ID` env var
7. restart the container
8. login using github. Re-login as admin and give github user admin rights.
9. Login using github. Generate a static access token for your user and save it to the local .env file as `ADMIN_ACCESS_TOKEN`

### Prod updates

1. fulfill all empty `.env.scripts.production` values, make sure ADMIN_ACCESS_TOKEN has your access token
2. if there are changes in `.env.docker.production.example` copy them to the env vars of the container
3. `pnpm run schema:apply:production`. Restart is required after updating the schema (https://github.com/directus/directus/issues/17117)
4. `pnpm run migrate:production`
5. stop prev container, run new container

## Commands

Create extension:

1. `npx --yes create-directus-extension@latest`
2. Run script from the extension folder to set up unit testing
```bash
original_dir=$PWD
pnpm add --save-dev chai @types/chai mocha @types/mocha sinon @types/sinon ts-node @directus/extensions @directus/types
pnpm add @directus/errors
jq --tab 'del(.compilerOptions.rootDir) | .compilerOptions.module = "NodeNext" | .compilerOptions.moduleResolution = "NodeNext" | .compilerOptions.target = "ES2022" | .compilerOptions.lib[0] = "ES2023" | .compilerOptions.resolveJsonModule = true | .compilerOptions.types = ["node", "mocha"] | .include = ["./src/**/*.ts", "../../lib/**/*.ts", "./test/**/*.ts"]' tsconfig.json > temp.json && mv temp.json tsconfig.json
jq --tab '.scripts.test = "tsc --noEmit && NODE_ENV=test mocha"' package.json > temp.json && mv temp.json package.json
jq --tab '.scripts."test:dev" = "NODE_ENV=test TS_NODE_TRANSPILE_ONLY=true mocha"' package.json > temp.json && mv temp.json package.json
mkdir test
while [[ $PWD != */extensions ]]; do cd ..; done
cp ./operations/gh-webhook-handler/.mocharc.json "$original_dir/"
cp ./operations/gh-webhook-handler/wallaby.js "$original_dir/"
cd "$original_dir"
```
3. Run script from the extension to fix wallaby.js
```bash
original_dir=$PWD
cd ../../lib/src
ln -s $PWD "$original_dir/lib"
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
