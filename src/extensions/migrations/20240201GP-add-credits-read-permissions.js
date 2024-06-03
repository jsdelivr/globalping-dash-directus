const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_ROLE_NAME = 'User';

async function getUserRoleId () {
	const URL = `${DIRECTUS_URL}/roles?filter[name][_eq]=${USER_ROLE_NAME}&access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	return response.data[0].id;
}

async function createPermissions (roleId) {
	const URL = `${DIRECTUS_URL}/permissions?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify([
			{
				collection: 'gp_credits_additions',
				action: 'read',
				role: roleId,
				permissions: {
					_and: [
						{
							github_id: {
								_eq: '$CURRENT_USER.external_identifier',
							},
						},
					],
				},
				fields: [
					'amount',
					'comment',
					'date_created',
					'user_updated',
				],
			},
			{
				collection: 'gp_credits_deductions',
				action: 'read',
				role: roleId,
				permissions: {
					_and: [
						{
							user_id: {
								_eq: '$CURRENT_USER',
							},
						},
					],
				},
				fields: [
					'date',
					'amount',
					'date_created',
					'date_updated',
				],
			},
		]),
		headers: {
			'Content-Type': 'application/json',
		},
	}).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	return response.data;
}

async function getUserPermissions (roleId) {
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=gp_credits&filter[role][_eq]=${roleId}&access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	const permissions = response.data;
	const readPermissions = permissions.find(({ action }) => action === 'read');

	return { readPermissions };
}

async function patchReadPermissions (readPermissions) {
	const URL = `${DIRECTUS_URL}/permissions/${readPermissions.id}?access_token=${ADMIN_ACCESS_TOKEN}`;

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...readPermissions,
			permissions: {
				_and: [
					{
						user_id: {
							_eq: '$CURRENT_USER',
						},
					},
				],
			},
			fields: [
				'amount',
			],
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	}).then((response) => {
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
	const { readPermissions } = await getUserPermissions(roleId);
	await patchReadPermissions(readPermissions);
	console.log(`Read credits permissions added`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
