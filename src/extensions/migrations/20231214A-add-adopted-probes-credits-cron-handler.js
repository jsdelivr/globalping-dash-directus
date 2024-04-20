const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const FLOW_ID = '4d64c5a9-f731-4654-823d-9bda7f5c4ebe'; // Flow id needs to be a uuid, as Directus throws otherwise. This is a random value.

async function createFlow () {
	const URL = `${DIRECTUS_URL}/flows?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			id: FLOW_ID,
			name: 'Adopted probes credits CRON',
			description: 'Add Globalping credits for adopted probes',
			status: 'active',
			trigger: 'schedule',
			accountability: 'all',
			options: {
				cron: '0 0 * * *',
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
	const URL = `${DIRECTUS_URL}/operations?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			flow: FLOW_ID,
			name: 'Adopted probes credits CRON handler',
			key: 'adopted_probes_credits_cron_handler',
			type: 'adopted-probes-credits-cron-handler',
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
	const URL = `${DIRECTUS_URL}/flows/${FLOW_ID}?access_token=${ADMIN_ACCESS_TOKEN}`;
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
	console.log('Adopted probes credits CRON handler added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
