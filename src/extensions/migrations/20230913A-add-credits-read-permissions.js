const BASE_DIRECTUS_URL = 'http://127.0.0.1:8055';
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_ROLE_NAME = 'User';

async function getUserRoleId () {
	const URL = `${BASE_DIRECTUS_URL}/roles?filter[name][_eq]=${USER_ROLE_NAME}&access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL).then(response => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}
		return response.json();
	});
	return response.data[0].id;
}

async function createPermissions (roleId) {
	const URL = `${BASE_DIRECTUS_URL}/permissions?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify([
			{
				collection: 'credits',
				action: 'read',
				role: roleId,
				permissions: {
					_and: [
						{
							githubId: {
								_eq: '$CURRENT_USER.external_identifier'
							}
						}
					]
				},
				fields: [
					'githubLogin',
					'githubId',
					'amount',
					'credits',
					'date_created'
				]
			}
		]),
		headers: {
			'Content-Type': 'application/json',
		},
	}).then(response => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}
		return response.json();
	});
	return response.data;
}

export async function up () {
	const roleId = await getUserRoleId();
	await createPermissions(roleId);
	console.log(`Read credits permissions added`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
