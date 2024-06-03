import _ from 'lodash';

/**
 * @typedef {import('knex').Knex.Config} KnexConfig
 * @type {{ [key: string]: KnexConfig }}
 */
export default _.merge({}, ...[ 'development' ].map((environment) => {
	return {
		[environment]: {
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
				directory: `./seeds/${environment}`,
			},
		},
	};
}));
