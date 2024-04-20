const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

async function addCssRules () {
	const URL = `${DIRECTUS_URL}/settings?access_token=${ADMIN_ACCESS_TOKEN}`;

	const result = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			module_bar: [{
				type: 'module',
				id: 'content',
				enabled: true,
			},
			{
				type: 'module',
				id: 'users',
				enabled: true,
			},
			{
				type: 'module',
				id: 'files',
				enabled: true,
			},
			{
				type: 'module',
				id: 'insights',
				enabled: true,
			},
			{
				type: 'module',
				id: 'settings',
				enabled: true,
				locked: true,
			},
			{
				type: 'module',
				id: 'probes-adapter',
				enabled: true,
			}],
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

	return result.data;
}

export async function up () {
	await addCssRules();
	console.log('Successfully updated css rules.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
