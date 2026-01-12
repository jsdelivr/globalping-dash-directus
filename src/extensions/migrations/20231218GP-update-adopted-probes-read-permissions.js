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

async function getUserPermissions (policyId) {
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=adopted_probes&filter[policy][_eq]=${policyId}`;
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

	const newFields = readPermissions.fields.filter(field => field !== 'date_updated');

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...readPermissions,
			fields: newFields,
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
	const { readPermissions } = await getUserPermissions(policyId);
	await patchReadPermissions(readPermissions);
	console.log('Credits read permissions updated.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
