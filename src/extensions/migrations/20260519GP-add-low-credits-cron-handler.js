const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const FLOW_ID = 'bf8c49f8-056d-4190-9855-107c8e251930'; // Flow id needs to be a uuid, as Directus throws otherwise. This is a random value.

async function createFlow () {
	const URL = `${DIRECTUS_URL}/flows`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			id: FLOW_ID,
			name: 'Low credits CRON',
			description: 'Notifies users when their Globalping credits drop below their threshold.',
			status: 'active',
			trigger: 'schedule',
			accountability: 'all',
			options: {
				cron: '*/5 * * * *',
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

async function createOperation () {
	const URL = `${DIRECTUS_URL}/operations`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			flow: FLOW_ID,
			name: 'Low credits CRON handler',
			key: 'low_credits_cron_handler',
			type: 'low-credits-cron-handler',
			position_x: 19,
			position_y: 1,
			options: {},
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

async function assignOperationToFlow (operationId) {
	const URL = `${DIRECTUS_URL}/flows/${FLOW_ID}`;
	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			operation: operationId,
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
	await createFlow();
	const operation = await createOperation();
	await assignOperationToFlow(operation.id);
	console.log('Low credits CRON handler added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
