const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_POLICY_NAME = 'User';

async function getUserPolicyId () {
	const URL = `${DIRECTUS_URL}/policies?filter[name][_eq]=${USER_POLICY_NAME}`;
	const response = await fetch(URL, {
		headers: {
			Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
		},
	}).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	return response.data[0].id;
}

async function createPermissions (policyId) {
	const URL = `${DIRECTUS_URL}/permissions`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify([
			{
				collection: 'gp_credits_additions',
				action: 'read',
				policy: policyId,
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
				policy: policyId,
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
			'Authorization': `Bearer ${ADMIN_ACCESS_TOKEN}`,
		},
	}).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	return response.data;
}

async function getUserPermissions (policyId) {
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=gp_credits&filter[policy][_eq]=${policyId}`;
	const response = await fetch(URL, {
		headers: {
			Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
		},
	}).then((response) => {
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
	const URL = `${DIRECTUS_URL}/permissions/${readPermissions.id}`;

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
			'Authorization': `Bearer ${ADMIN_ACCESS_TOKEN}`,
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
	const policyId = await getUserPolicyId();
	await createPermissions(policyId);
	const { readPermissions } = await getUserPermissions(policyId);
	await patchReadPermissions(readPermissions);
	console.log(`Read credits permissions added`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
