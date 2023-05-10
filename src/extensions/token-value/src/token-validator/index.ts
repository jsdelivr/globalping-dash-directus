import { defineHook } from '@directus/extensions-sdk';
import { hashToken } from '../utils/token';


export default defineHook(({ filter, action }) => {
	filter('tokens.items.create', (payload, query, collection) => {
        const value = payload.value;
        const hashedToken = hashToken(value);
        payload.value = hashedToken;
	});

	filter('tokens.items.update', (payload, query, collection) => {
        const value = payload.value;
        if (value === undefined) {
            return;
        }
        const hashedToken = hashToken(value);
        payload.value = hashedToken;
	});
});
