const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_POLICY_NAME = 'User';

const COLLECTION_NAME = 'directus_users';
const FIELDS_TO_REMOVE = [];
const FIELDS_TO_ADD = [ 'first_name', 'last_name', 'email' ];

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
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=${COLLECTION_NAME}&filter[policy][_eq]=${policyId}`;
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
	const updatePermissions = permissions.find(({ action }) => action === 'update');

	return { readPermissions, updatePermissions };
}

async function patchUpdatePermissions (updatePermissions) {
	const URL = `${DIRECTUS_URL}/permissions/${updatePermissions.id}`;
	const filteredFields = updatePermissions.fields.filter(field => !FIELDS_TO_REMOVE.includes(field));

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...updatePermissions,
			fields: [
				...filteredFields,
				...FIELDS_TO_ADD,
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

async function postDeletePermission (policyId) {
	const URL = `${DIRECTUS_URL}/permissions`;

	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			policy: policyId,
			collection: 'directus_users',
			action: 'delete',
			permissions: {
				_and: [
					{
						id: {
							_eq: '$CURRENT_USER',
						},
					},
				],
			},
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
	const { updatePermissions } = await getUserPermissions(policyId);
	await patchUpdatePermissions(updatePermissions);
	await postDeletePermission(policyId);
	console.log('User permissions patched to edit "first_name", "last_name", "email" and delete account.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
