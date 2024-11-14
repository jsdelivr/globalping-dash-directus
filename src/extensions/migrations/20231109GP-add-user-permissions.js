const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_POLICY_NAME = 'User';

async function getUserPolicyId () {
	const URL = `${DIRECTUS_URL}/policies?filter[name][_eq]=${USER_POLICY_NAME}&access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	return response.data[0].id;
}

async function getUserPermissions (policyId) {
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=directus_users&filter[policy][_eq]=${policyId}&access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	const permissions = response.data;
	const readPermissions = permissions.find(({ action }) => action === 'read');
	const updatePermissions = permissions.find(({ action }) => action === 'update');

	return { readPermissions, updatePermissions };
}

async function patchReadPermissions (readPermissions) {
	const URL = `${DIRECTUS_URL}/permissions/${readPermissions.id}?access_token=${ADMIN_ACCESS_TOKEN}`;
	const filteredFields = readPermissions.fields.filter(field => field !== 'theme');

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...readPermissions,
			fields: [
				...filteredFields,
				'appearance',
				'theme_light',
				'theme_dark',
				'theme_light_overrides',
				'theme_dark_overrides',
				'github',
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

async function patchUpdatePermissions (updatePermissions) {
	const URL = `${DIRECTUS_URL}/permissions/${updatePermissions.id}?access_token=${ADMIN_ACCESS_TOKEN}`;
	const filteredFields = updatePermissions.fields.filter(field => field !== 'theme');

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...updatePermissions,
			fields: [
				...filteredFields,
				'appearance',
				'theme_light',
				'theme_dark',
				'theme_light_overrides',
				'theme_dark_overrides',
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
	const policyId = await getUserPolicyId();
	const { readPermissions, updatePermissions } = await getUserPermissions(policyId);
	await patchReadPermissions(readPermissions);
	await patchUpdatePermissions(updatePermissions);
	console.log('User permissions patched');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
