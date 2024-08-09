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

export async function getUserPermissions (collectionName) {
	const userRoleId = await getUserRoleId();
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=${collectionName}&filter[role][_eq]=${userRoleId}&access_token=${ADMIN_ACCESS_TOKEN}`;
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

export async function updatePermissions (readPermissions, fieldsToAdd, fieldsToRemove) {
	if (!readPermissions) {
		throw new Error(`Permissions object is empty.`);
	}

	if (!readPermissions.id) {
		console.error(readPermissions);
		throw new Error(`Permissions ID is missing. This may happen when there are multiple rows for the same permission type.`);
	}

	const URL = `${DIRECTUS_URL}/permissions/${readPermissions.id}?access_token=${ADMIN_ACCESS_TOKEN}`;
	const filteredFields = readPermissions.fields.filter(field => !fieldsToRemove.includes(field));

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...readPermissions,
			fields: [
				...filteredFields,
				...fieldsToAdd,
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
