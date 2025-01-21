const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_POLICY_NAME = 'User';

// MANAGE USER PERMISSIONS

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

export async function getUserPermissions (collectionName) {
	const policyId = await getUserPolicyId();
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=${collectionName}&filter[policy][_eq]=${policyId}&access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL).then((response) => {
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

	const URL = `${DIRECTUS_URL}/permissions/${permissionsObj.id}?access_token=${ADMIN_ACCESS_TOKEN}`;
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
		},
	}).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	return response.data;
}

// ADD FLOWS

export async function createFlow (flowId, config) {
	const URL = `${DIRECTUS_URL}/flows?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			id: flowId,
			status: 'active',
			accountability: 'all',
			...config,
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

export async function createOperation (flowId, config) {
	const URL = `${DIRECTUS_URL}/operations?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			flow: flowId,
			position_x: 19,
			position_y: 1,
			options: {},
			...config,
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

export async function assignOperationToFlow (flowId, operationId) {
	const URL = `${DIRECTUS_URL}/flows/${flowId}?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			operation: operationId,
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
