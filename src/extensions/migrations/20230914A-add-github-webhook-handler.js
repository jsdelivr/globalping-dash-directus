const BASE_DIRECTUS_URL = 'http://127.0.0.1:8055';
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const WEBHOOK_FLOW_ID = process.env.WEBHOOK_FLOW_ID;

async function createFlow () {
	const URL = `${BASE_DIRECTUS_URL}/flows?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			id: WEBHOOK_FLOW_ID,
			name: 'Github webhook',
			description: 'Add Globalping credits for the Github sponsorship',
			status: 'active',
			trigger: 'webhook',
			accountability: 'all',
			options: {
				method: 'POST',
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

async function createOperation () {
	const URL = `${BASE_DIRECTUS_URL}/operations?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			flow: WEBHOOK_FLOW_ID,
			name: 'Sponsorship handler',
			key: 'sponsorship_handler',
			type: 'gh-webhook-handler',
			position_x: 19,
			position_y: 1,
			options: {},
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

async function assignOperationToFlow (operationId) {
	const URL = `${BASE_DIRECTUS_URL}/flows/${WEBHOOK_FLOW_ID}?access_token=${ADMIN_ACCESS_TOKEN}`;
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

export async function up () {
	await createFlow();
	const operation = await createOperation();
	await assignOperationToFlow(operation.id);
	console.log('Github webhook handler added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
