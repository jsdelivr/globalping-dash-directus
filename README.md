# dashboard

## Run:

### 1. Preparation

- Copy `dotenv` file content to `.env` and fulfill values. All fields except `AUTH_GITHUB_CLIENT_ID` and `AUTH_GITHUB_CLIENT_SECRET` can be your own random data.

### 2. Start dev db

- run `docker network create mariadbnt`
- run `docker run --name mariadbcn --network mariadbnt -d --env-file=.env -p 3306:3306 mariadb:10.6`
- `docker run -it --network mariadbnt --rm mariadb mariadb -h mariadbcn -u directus -p`
- inside mariadb `USE directus; ALTER DATABASE directus CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`

### 3. Start dev dashboard

- run `./deploy.sh` and follow instructions

## Generate the schema:

`docker compose exec directus npx directus schema snapshot --yes /directus/snapshots/collections-schema.yml`
