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

export async function getUserPermissions (collectionName) {
	const policyId = await getUserPolicyId();
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=${collectionName}&filter[policy][_eq]=${policyId}`;
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
	const createPermissions = permissions.find(({ action }) => action === 'create');
	const updatePermissions = permissions.find(({ action }) => action === 'update');
	const deletePermissions = permissions.find(({ action }) => action === 'delete');

	return { readPermissions, createPermissions, updatePermissions, deletePermissions };
}

export async function editPermissions (permissionsObj, fieldsToAdd = [], fieldsToRemove = []) {
	if (!permissionsObj) {
		throw new Error(`Permissions object is empty.`);
	}

	if (!permissionsObj.id) {
		console.error(permissionsObj);
		throw new Error(`Permissions ID is missing. This may happen when there are multiple rows for the same permission type.`);
	}

	const URL = `${DIRECTUS_URL}/permissions/${permissionsObj.id}`;
	const filteredFields = permissionsObj.fields.filter(field => !fieldsToRemove.includes(field));

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...permissionsObj,
			fields: [
				...filteredFields,
				...fieldsToAdd,
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
