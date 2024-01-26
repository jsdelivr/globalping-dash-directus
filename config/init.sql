CREATE DATABASE IF NOT EXISTS `directus-test`;
GRANT ALL PRIVILEGES ON `directus-test`.* to 'directus'@'%';

USE directus;

-- Directus issue https://github.com/directus/directus/discussions/11786
ALTER DATABASE directus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
