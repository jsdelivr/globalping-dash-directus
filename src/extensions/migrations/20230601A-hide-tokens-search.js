const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

async function addCssRules () {
	const URL = `${DIRECTUS_URL}/settings?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			custom_css: '.search-input {\n  display: none !important;\n}\n\nbody:not(:has(.router-link-active[href="/admin/content/tokens"])) .search-input {\n\tdisplay: flex !important;\n}',
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
	await addCssRules();
	console.log('Successfully updated css rules.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
