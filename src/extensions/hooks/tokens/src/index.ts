import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }) => {
	filter('tokens.items.update', function(item, query, collection) {
		if (typeof item.value === 'string' && item.value === '*****') {
			delete item.value;
		}
	});

	action('tokens.items.read', (query, collection) => {
		query.payload.forEach(item => {
			if (item.value) {
				item.value = '*****';
			}
		});
	});

	action('revisions.read', (query, collection) => {
		query.payload.forEach(item => {
			if (item.data.value) {
				item.data.value = '*****';
			}

			if (item.delta.value) {
				item.delta.value = '*****';
			}
		});
	});
});
