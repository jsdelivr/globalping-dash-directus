const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

if (!DIRECTUS_URL || !ADMIN_ACCESS_TOKEN) {
	throw new Error(`DIRECTUS_URL and ADMIN_ACCESS_TOKEN must be set. Actual values: DIRECTUS_URL: ${DIRECTUS_URL}, ADMIN_ACCESS_TOKEN: ${ADMIN_ACCESS_TOKEN}`);
}

export async function createFlow (flowId, config) {
	const URL = `${DIRECTUS_URL}/flows`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			id: flowId,
			status: 'active',
			accountability: 'all',
			...config,
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

export async function createOperation (flowId, config) {
	const URL = `${DIRECTUS_URL}/operations`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			flow: flowId,
			position_x: 19,
			position_y: 1,
			options: {},
			...config,
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

export async function assignOperationToFlow (flowId, operationId) {
	const URL = `${DIRECTUS_URL}/flows/${flowId}`;
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
