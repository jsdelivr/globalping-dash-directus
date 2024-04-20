import { defineHook } from '@directus/extensions-sdk';
import { validateToken } from './actions/validate-token.js';
import { validateQuery } from './actions/validate-items-query.js';

export type Token = {
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

type Revision = {
		data: Token;
		delta: Token;
};

export default defineHook(({ action, filter }) => {
	filter('gp_tokens.items.create', (payload) => {
		const token = payload as Token;
		validateToken(token);
	});

	filter('gp_tokens.items.update', (payload) => {
		const token = payload as Partial<Token>;
		validateToken(token);
	});

	filter('gp_tokens.items.query', (query) => {
		validateQuery(query as object);
	});

	filter('gp_tokens.items.read', (_items, request) => {
		validateQuery(request.query);
	});

	action('gp_tokens.items.read', (query) => {
		const payload = query.payload as Token[];
		payload.forEach((item) => {
			if (item.value) {
				item.value = '********';
			}
		});
	});

	action('revisions.read', (query) => {
		const payload = query.payload as Revision[];
		payload.forEach((item) => {
			if (item.data?.value) {
				item.data.value = '********';
			}

			if (item.delta?.value) {
				item.delta.value = '********';
			}
		});
	});
});
