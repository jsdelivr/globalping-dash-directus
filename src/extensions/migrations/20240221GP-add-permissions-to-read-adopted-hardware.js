const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_ROLE_NAME = 'User';

const COLLECTION_NAME = 'gp_adopted_probes';
const FIELDS_TO_REMOVE = [];
const FIELDS_TO_ADD = [ 'hardwareDevice' ];

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

	return { readPermissions };
}

async function patchReadPermissions (readPermissions) {
	const URL = `${DIRECTUS_URL}/permissions/${readPermissions.id}?access_token=${ADMIN_ACCESS_TOKEN}`;
	const filteredFields = readPermissions.fields.filter(field => !FIELDS_TO_REMOVE.includes(field));

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...readPermissions,
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

export async function up () {
	const roleId = await getUserRoleId();
	const { readPermissions } = await getUserPermissions(roleId);
	await patchReadPermissions(readPermissions);
	console.log('User permissions patched read adopted probes "hardwareDevice" field');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
