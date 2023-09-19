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

## Generate the schema:

`docker compose exec directus npx directus schema snapshot --yes /directus/snapshots/collections-schema.yml`

## Run migration

`docker-compose exec directus npx directus database migrate:latest`

## Create extension

`npx create-directus-extension@latest`
