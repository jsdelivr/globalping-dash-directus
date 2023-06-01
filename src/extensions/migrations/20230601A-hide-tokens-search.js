const BASE_DIRECTUS_URL = 'http://127.0.0.1:8055';
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

async function addCssRules () {
	const URL = `${BASE_DIRECTUS_URL}/settings?access_token=${ADMIN_ACCESS_TOKEN}`;
	const response = await fetch(URL, {
		method: 'POST',
		body: JSON.stringify({
			custom_css: '.search-input {\n  display: none !important;\n}\n\nbody:not(:has(.router-link-active[href=\"/admin/content/tokens\"])) .search-input {\n\tdisplay: flex !important;\n}',
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	}).then(response => response.json());
	return response.data;
}

export async function up () {
	await addCssRules();
	console.log('Successfully updated css rules.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
