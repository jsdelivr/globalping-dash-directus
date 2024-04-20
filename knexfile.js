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
				host: 'localhost',
				user: 'directus',
				password: 'password',
				database: 'directus',
				port: 3306,
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
