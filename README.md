# dashboard

## Deploy

1. run `docker run --name mariadb -d --env-file=.env -p 3306:3306 mariadb:10.6`
2. in mariadb run `ALTER DATABASE directus CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;`
3. run `./deploy.sh` and follow instructions
