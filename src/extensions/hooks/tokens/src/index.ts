import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }) => {
	action('tokens.items.read', (query, collection) => {
		query.payload.forEach(item => {
			if (item.value) {
				item.value = '********';
			}
		});
	});

	action('revisions.read', (query, collection) => {
		query.payload.forEach(item => {
			if (item.data?.value) {
				item.data.value = '********';
			}

			if (item.delta?.value) {
				item.delta.value = '********';
			}
		});
	});
});
