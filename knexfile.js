/**
 * @typedef {import('knex').Knex.Config} KnexConfig
 * @type {{ [key: string]: KnexConfig }}
 */
export default {
	development: {
		client: 'mysql',
		connection: {
			host: process.env.DB_HOST || 'localhost',
			user: process.env.DB_USER || 'directus',
			password: process.env.DB_PASSWORD || 'password',
			database: process.env.DB_DATABSE || 'dashboard-globalping',
			port: process.env.DB_PORT || 13306,
		},
		pool: {
			min: 0,
			max: 10,
			propagateCreateError: false,
		},
		acquireConnectionTimeout: 2000,
		seeds: {
			directory: `./seeds/development`,
		},
	},
	e2e: {
		client: 'mysql',
		connection: {
			host: process.env.DB_HOST || '127.0.0.1',
			user: process.env.DB_USER || 'directus',
			password: process.env.DB_PASSWORD || 'password',
			database: process.env.DB_DATABSE || 'dashboard-globalping',
			port: process.env.DB_PORT || 13306,
		},
		pool: {
			min: 0,
			max: 10,
			propagateCreateError: false,
		},
		acquireConnectionTimeout: 2000,
	},
};
