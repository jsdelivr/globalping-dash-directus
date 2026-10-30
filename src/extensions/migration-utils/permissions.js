import { directusRequest } from './directus-request.js';

const USER_POLICY_NAME = 'User';
const PUBLIC_POLICY_NAME = '$t:public_label';

async function getPolicyId (name) {
	const policies = await directusRequest(`/policies?filter[name][_eq]=${encodeURIComponent(name)}`);
	return policies[0].id;
}

export function getUserPolicyId () {
	return getPolicyId(USER_POLICY_NAME);
}

export function getPublicPolicyId () {
	return getPolicyId(PUBLIC_POLICY_NAME);
}

export async function getUserPermissions (collectionName) {
	const policyId = await getUserPolicyId();
	const permissions = await directusRequest(`/permissions?filter[collection][_eq]=${collectionName}&filter[policy][_eq]=${policyId}`);
	const readPermissions = permissions.find(({ action }) => action === 'read');
	const createPermissions = permissions.find(({ action }) => action === 'create');
	const updatePermissions = permissions.find(({ action }) => action === 'update');
	const deletePermissions = permissions.find(({ action }) => action === 'delete');

	return { readPermissions, createPermissions, updatePermissions, deletePermissions };
}

export function createPermissions (permissions) {
	return directusRequest('/permissions', 'POST', permissions);
}

export async function editPermissions (permissionsObj, fieldsToAdd = [], fieldsToRemove = []) {
	if (!permissionsObj) {
		throw new Error(`Permissions object is empty.`);
	}

	if (!permissionsObj.id) {
		console.error(permissionsObj);
		throw new Error(`Permissions ID is missing. This may happen when there are multiple rows for the same permission type.`);
	}

	const filteredFields = permissionsObj.fields.filter(field => !fieldsToRemove.includes(field));

	return directusRequest(`/permissions/${permissionsObj.id}`, 'PATCH', {
		...permissionsObj,
		fields: [ ...new Set([ ...filteredFields, ...fieldsToAdd ]) ],
	});
}
