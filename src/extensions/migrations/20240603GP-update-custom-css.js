const DIRECTUS_URL = process.env.DIRECTUS_URL;
const ADMIN_ACCESS_TOKEN = process.env.ADMIN_ACCESS_TOKEN;

async function updateCssRules () {
	const URL = `${DIRECTUS_URL}/settings`;
	const response = await fetch(URL, {
		method: 'PATCH',
		body: JSON.stringify({
			custom_css:
`body:has(.router-link-active[href="/admin/content/gp_tokens"]) .search-input {
	display: none !important;
}

.module-bar-logo {
	background-color: inherit !important;
}

.module-bar-logo .custom-logo {
	scale: .7;
}`,
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
	await updateCssRules();
	console.log('Successfully updated custom css.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
