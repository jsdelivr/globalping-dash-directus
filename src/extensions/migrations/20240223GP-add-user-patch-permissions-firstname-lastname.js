const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_ROLE_NAME = 'User';

const COLLECTION_NAME = 'directus_users';
const FIELDS_TO_REMOVE = [];
const FIELDS_TO_ADD = [ 'first_name', 'last_name', 'email' ];

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

async function getUserPermissions (roleId) {
	const URL = `${DIRECTUS_URL}/permissions?filter[collection][_eq]=${COLLECTION_NAME}&filter[role][_eq]=${roleId}&access_token=${ADMIN_ACCESS_TOKEN}`;
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

async function patchUpdatePermissions (updatePermissions) {
	const URL = `${DIRECTUS_URL}/permissions/${updatePermissions.id}?access_token=${ADMIN_ACCESS_TOKEN}`;
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
		},
	}).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.json();
	});
	return response.data;
}

async function postDeletePermission (roleId) {
	const URL = `${DIRECTUS_URL}/permissions?access_token=${ADMIN_ACCESS_TOKEN}`;

	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			role: roleId,
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
	const { updatePermissions } = await getUserPermissions(roleId);
	await patchUpdatePermissions(updatePermissions);
	await postDeletePermission(roleId);
	console.log('User permissions patched to edit "first_name", "last_name", "email" and delete account.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
