const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

const POLICY_NAME = 'System';
const ROLE_NAME = 'System';
const USER_FIRST_NAME = 'system';
const USER_TOKEN = 'directusSystemToken';

if (!DIRECTUS_URL || !ADMIN_ACCESS_TOKEN) {
	throw new Error(`DIRECTUS_URL and ADMIN_ACCESS_TOKEN must be set. Actual values: DIRECTUS_URL: ${DIRECTUS_URL}, ADMIN_ACCESS_TOKEN: ${ADMIN_ACCESS_TOKEN}`);
}

async function directusRequest (path, method = 'GET', body) {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${ADMIN_ACCESS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		const responseText = await response.text();

		throw new Error(`Fetch request failed. Status: ${response.status} ${response.statusText}. Response body: ${responseText}`);
	}

	const json = await response.json();
	return json.data;
}

async function createPolicy () {
	return directusRequest('/policies', 'POST', {
		name: POLICY_NAME,
		icon: 'robot_2',
		admin_access: false,
		app_access: false,
	});
}

async function createRole () {
	return directusRequest('/roles', 'POST', {
		name: ROLE_NAME,
		icon: 'robot_2',
	});
}

async function assignPolicyToRole (roleId, policyId) {
	return directusRequest(`/roles/${roleId}`, 'PATCH', {
		policies: {
			create: [
				{
					role: roleId,
					policy: {
						id: policyId,
					},
				},
			],
			update: [],
			delete: [],
		},
	});
}

async function createNotificationsPermission (policyId) {
	return directusRequest('/permissions', 'POST', {
		collection: 'directus_notifications',
		action: 'create',
		policy: policyId,
		permissions: {},
		validation: {},
		fields: [ '*' ],
	});
}

async function createUser (roleId) {
	return directusRequest('/users', 'POST', {
		first_name: USER_FIRST_NAME,
		default_prefix: USER_FIRST_NAME,
		status: 'active',
		role: roleId,
		token: USER_TOKEN,
	});
}

export async function up () {
	const policy = await createPolicy();
	const role = await createRole();
	await assignPolicyToRole(role.id, policy.id);
	await createNotificationsPermission(policy.id);
	await createUser(role.id);
	console.log(`Created ${USER_FIRST_NAME} user with role policy for notifications create.`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
