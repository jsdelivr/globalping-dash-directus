const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const GP_SYSTEM_KEY = process.env.GP_SYSTEM_KEY;

const SYSTEM_USER_ID = 'f3249755-8b2b-43e6-878e-d5387afe1a24';

if (!DIRECTUS_URL || !ADMIN_ACCESS_TOKEN || !GP_SYSTEM_KEY) {
	throw new Error(`DIRECTUS_URL, ADMIN_ACCESS_TOKEN and GP_SYSTEM_KEY must be set. Actual values: DIRECTUS_URL: ${DIRECTUS_URL}.`);
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
		name: 'System',
		icon: 'robot_2',
		admin_access: false,
		app_access: false,
	});
}

async function createRole () {
	return directusRequest('/roles', 'POST', {
		name: 'System',
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
		id: SYSTEM_USER_ID,
		first_name: 'system',
		default_prefix: 'system',
		status: 'active',
		role: roleId,
		token: GP_SYSTEM_KEY,
	});
}

export async function up () {
	const policy = await createPolicy();
	const role = await createRole();
	await assignPolicyToRole(role.id, policy.id);
	await createNotificationsPermission(policy.id);
	await createUser(role.id);
	console.log(`Created system user with role policy for notifications create.`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
