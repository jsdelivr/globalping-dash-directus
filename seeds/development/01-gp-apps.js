import { randomUUID } from 'node:crypto';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export const seed = async (knex) => {
	await knex('gp_apps').insert([{
		id: randomUUID(),
		user_created: null,
		date_created: '2024-09-01 00:00:00',
		name: 'Auth Code App',
		secrets: JSON.stringify([ 'QicY5X3BLipbyojWkfzyd0vRYth/C/2GsCYw6VRfLgI=' ]), // secret: ic3sba25i27s6gic3ksb376krrmtsjbxk2uzn7v5fk6gmiqj
		grants: JSON.stringify([ 'authorization_code', 'refresh_token' ]),
		redirect_urls: JSON.stringify([ 'http://localhost:13010' ]),
	}, {
		id: randomUUID(),
		user_created: null,
		date_created: '2024-09-01 00:00:00',
		name: 'Client Credentials App',
		owner_name: 'jsDelivr',
		owner_url: 'https://www.jsdelivr.com/',
		secrets: JSON.stringify([ 'xhQKGe2+hSCGgAnYYNF6uBNMFJ1YvcpaRzVs+JSpaWw=' ]), // secret: lyrhib7f2dtuh6fzojvupfhh4olkxofd4kibutw6z5guihvz
		grants: JSON.stringify([ 'globalping_client_credentials', 'refresh_token' ]),
		redirect_urls: JSON.stringify([ 'http://localhost:13010' ]),
	}]);
};
