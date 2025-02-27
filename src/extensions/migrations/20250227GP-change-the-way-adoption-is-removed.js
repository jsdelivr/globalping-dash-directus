import { getUserPermissions } from '../migration-utils.js';

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const COLLECTION_NAME = 'gp_probes';

export async function up () {
	const { updatePermissions, deletePermissions } = await getUserPermissions(COLLECTION_NAME);
	await removeDeletePermissions(deletePermissions);
	await allowResettingUserId(updatePermissions);
	console.log(`Changed the way adoption is removed in: ${COLLECTION_NAME}`);
}

export async function removeDeletePermissions (permissionsObj) {
	if (!permissionsObj) {
		throw new Error(`Permissions object is empty.`);
	}

	if (!permissionsObj.id) {
		console.error(permissionsObj);
		throw new Error(`Permissions ID is missing. This may happen when there are multiple rows for the same permission type.`);
	}

	const URL = `${DIRECTUS_URL}/permissions/${permissionsObj.id}?access_token=${ADMIN_ACCESS_TOKEN}`;

	const response = await fetch(URL, {
		method: 'DELETE',
		headers: {
			'Content-Type': 'application/json',
		},
	}).then((response) => {
		if (!response.ok) {
			throw new Error(`Fetch request failed. Status: ${response.status}`);
		}

		return response.text();
	});
	return response.data;
}

export async function allowResettingUserId (permissionsObj) {
	if (!permissionsObj) {
		throw new Error(`Permissions object is empty.`);
	}

	if (!permissionsObj.id) {
		console.error(permissionsObj);
		throw new Error(`Permissions ID is missing. This may happen when there are multiple rows for the same permission type.`);
	}

	const URL = `${DIRECTUS_URL}/permissions/${permissionsObj.id}?access_token=${ADMIN_ACCESS_TOKEN}`;

	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			...permissionsObj,
			fields: [
				...permissionsObj.fields,
				'userId',
			],
			validation: {
				_and: [
					{
						userId: {
							_null: true,
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

export async function down () {
	console.log('There is no down operation for that migration.');
}
