const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const USER_POLICY_NAME = 'User';

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

async function createPermissions (policyId) {
	const URL = `${DIRECTUS_URL}/permissions?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify([
			{
				collection: 'adopted_probes',
				action: 'read',
				policy: policyId,
				permissions: {
					_and: [
						{
							userId: {
								_eq: '$CURRENT_USER',
							},
						},
					],
				},
				fields: [
					'date_updated',
					'ip',
					'lastSyncDate',
					'date_created',
					'status',
					'version',
					'country',
					'city',
					'latitude',
					'longitude',
					'asn',
					'network',
				],
			},
		]),
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
	const policyId = await getUserPolicyId();
	await createPermissions(policyId);
	console.log(`Read credits permissions added`);
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
