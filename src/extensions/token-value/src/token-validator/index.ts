import { defineHook } from '@directus/extensions-sdk';
import {tokens} from '../token-generator';

export default defineHook(({ filter, action }) => {
	filter('tokens.items.create', (payload, query, collection) => {
        const value = payload.value;
        if (value && !tokens.has(value)) {
            throw new Error('Wrong token value');
        }
	});

    action('tokens.items.create', (query, collection) => {
        const value = query.payload?.value;
        tokens.delete(value);
    });



	filter('tokens.items.update', (payload, query, collection) => {
        const value = payload.value || payload.data?.value;
        if (value && !tokens.has(value)) {
            throw new Error('Wrong token value');
        }
	});

	action('tokens.items.update', (query, collection) => {
        const value = query.payload?.value || query.payload?.data?.value;
        tokens.delete(value);
	});
});
