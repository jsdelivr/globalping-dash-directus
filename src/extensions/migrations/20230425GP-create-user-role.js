const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

if (!DIRECTUS_URL || !ADMIN_ACCESS_TOKEN) {
	throw new Error(`DIRECTUS_URL and ADMIN_ACCESS_TOKEN must be set. Actual values: DIRECTUS_URL: ${DIRECTUS_URL}, ADMIN_ACCESS_TOKEN: ${ADMIN_ACCESS_TOKEN}`);
}

async function createRole () {
	const URL = `${DIRECTUS_URL}/roles?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			name: 'User',
			icon: 'sentiment_satisfied',
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

async function createPolicy () {
	const URL = `${DIRECTUS_URL}/policies?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			name: 'User',
			icon: 'sentiment_calm',
			admin_access: false,
			app_access: true,
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

async function assignPolicyToRole (role, policy) {
	const URL = `${DIRECTUS_URL}/roles/${role.id}?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			policies: {
				create: [{
					role: role.id,
					policy: {
						id: policy.id,
					},
				}],
				update: [],
				delete: [],
			},
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

async function createPermissions (policyId) {
	const URL = `${DIRECTUS_URL}/permissions?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify([
			{
				collection: 'tokens',
				action: 'create',
				policy: policyId,
				permissions: {
					user_created: {
						_eq: '$CURRENT_USER',
					},
				},
				fields: [ 'name', 'value', 'expire', 'origins' ],
			},
			{
				collection: 'tokens',
				action: 'read',
				policy: policyId,
				permissions: {
					user_created: {
						_eq: '$CURRENT_USER',
					},
				},
				fields: [ '*' ],
			},
			{
				collection: 'tokens',
				action: 'update',
				policy: policyId,
				permissions: {
					user_created: {
						_eq: '$CURRENT_USER',
					},
				},
				fields: [ 'name', 'value', 'expire', 'origins' ],
			},
			{
				collection: 'tokens',
				action: 'delete',
				policy: policyId,
				permissions: {
					user_created: {
						_eq: '$CURRENT_USER',
					},
				},
				fields: [ '*' ],
			},
			{
				collection: 'directus_users',
				action: 'read',
				policy: policyId,
				permissions: {
					id: {
						_eq: '$CURRENT_USER',
					},
				},
				fields: [ 'first_name', 'last_name', 'email', 'theme', 'token', 'status', 'external_identifier', 'provider' ],
			},
			{
				collection: 'directus_users',
				action: 'update',
				policy: policyId,
				permissions: {
					id: {
						_eq: '$CURRENT_USER',
					},
				},
				fields: [ 'theme', 'token', 'last_page' ],
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

export async function up () {
	const role = await createRole();
	const policy = await createPolicy();
	await assignPolicyToRole(role, policy);
	await createPermissions(policy.id);
	console.log(`User role ${role.id} created`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
