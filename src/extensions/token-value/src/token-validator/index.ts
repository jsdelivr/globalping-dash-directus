import { defineHook } from '@directus/extensions-sdk';
import { hashToken } from '../utils/token.js';

type Token = {
    id: number;
    name: string;
    value: string;
    expire?: string;
    origins?: string;
    date_created: string;
    date_updated?: string;
    user_created: string;
    user_updated?: string;
};

export default defineHook(({ filter }) => {
	filter('jsd_purge_tokens.items.create', (payload) => {
		const token = payload as Token;
		const hashedToken = hashToken(token.value);
		token.value = hashedToken;
	});

	filter('jsd_purge_tokens.items.update', (payload) => {
		const token = payload as Partial<Token>;

		if (token.value === undefined) {
			return;
		}

		const hashedToken = hashToken(token.value);
		token.value = hashedToken;
	});

	filter('gp_tokens.items.create', (payload) => {
		const token = payload as Token;
		const hashedToken = hashToken(token.value);
		token.value = hashedToken;
	});

	filter('gp_tokens.items.update', (payload) => {
		const token = payload as Partial<Token>;

		if (token.value === undefined) {
			return;
		}

		const hashedToken = hashToken(token.value);
		token.value = hashedToken;
	});
});
