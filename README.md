# dashboard

## Deploy

1. run `docker run --name mariadbcn --network mariadbnt -d --env-file=.env -p 3306:3306 mariadb:10.6`
2. `docker run -it --network mariadbnt --rm mariadb mariadb -h mariadbcn -u directus -p`
3. in mariadb run `USE directus;`
4. in mariadb run `ALTER DATABASE directus CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
5. run `./deploy.sh` and follow instructions
