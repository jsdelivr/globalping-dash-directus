const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;
const FLOW_ID = '284f22f9-0233-44ee-a9e1-503e9a2e3830'; // Flow id needs to be a uuid, as Directus throws otherwise. This is a random value.

async function createFlow () {
	const URL = `${DIRECTUS_URL}/flows?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			id: FLOW_ID,
			name: 'Adopted probes status CRON',
			description: 'Checks online status of the adopted probes',
			status: 'active',
			trigger: 'schedule',
			accountability: 'all',
			options: {
				cron: '*/10 * * * *',
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
			name: 'Adopted probes status CRON handler',
			key: 'adopted_probes_status_cron_handler',
			type: 'adopted-probes-status-cron-handler',
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
	console.log('Adopted probes status CRON handler added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
