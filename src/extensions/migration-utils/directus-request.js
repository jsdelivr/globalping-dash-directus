const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

export async function directusRequest (path, method = 'GET', body) {
	const response = await fetch(`${DIRECTUS_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${ADMIN_ACCESS_TOKEN}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		throw new Error(`Fetch request failed. Status: ${response.status} ${response.statusText}. Response body: ${await response.text()}`);
	}

	return response.status === 204 ? null : (await response.json()).data;
}
