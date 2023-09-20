# dashboard

## Run:

### 1. Preparation

- Copy `dotenv` file content to `.env` and fulfill values. All fields except `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET` can be your own random data.

### 2. Start dev db

- create network: `docker network create mariadbnt`
- start mariadb: `docker run --name mariadbcn --network mariadbnt -d --env-file=.env -p 3306:3306 mariadb:10.6`
- open mariadb cli (use MARIADB_PASSWORD): `docker run -it --network mariadbnt --rm mariadb mariadb -h mariadbcn -u directus -p`
- inside mariadb `USE directus; ALTER DATABASE directus CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
- close cli

### 3. Start dev dashboard

- run `./deploy.sh` and follow instructions

## Commands:

Generate the schema:

`docker compose exec directus npx directus schema snapshot --yes /directus/snapshots/collections-schema.yml`

Run migration:

`docker compose exec directus npx directus database migrate:latest`

Create extension:

`npx create-directus-extension@latest`

### Prepare dev host:

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
