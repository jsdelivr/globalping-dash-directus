# dashboard

## Start dev db

0. run `docker network create mariadbnt`
1. run `docker run --name mariadbcn --network mariadbnt -d --env-file=.env -p 3306:3306 mariadb:10.6`
2. `docker run -it --network mariadbnt --rm mariadb mariadb -h mariadbcn -u directus -p`
3. inside mariadb `USE directus; ALTER DATABASE directus CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`

## Start dev instance

`./deploy.sh`

## Generate the schema:

`docker compose exec directus npx directus schema snapshot --yes /directus/snapshots/collections-schema.yml`
