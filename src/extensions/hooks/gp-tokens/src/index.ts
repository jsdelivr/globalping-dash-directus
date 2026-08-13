import { defineHook } from '@directus/extensions-sdk';
import { validateAccount } from './actions/validate-account.js';
import { validateQuery } from './actions/validate-items-query.js';
import { validateToken } from './actions/validate-token.js';

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
	// PHASE4: make it required.
	account_id?: string | null;
};

type Revision = {
	data: Token;
	delta: Token;
};

export default defineHook(({ action, filter }) => {
	filter('gp_tokens.items.create', async (payload, _meta, context) => {
		const token = payload as Token;
		validateToken(token);
		await validateAccount(token, context);
	});

	filter('gp_tokens.items.update', async (payload, _meta, eventContext) => {
		const token = payload as Partial<Token>;
		validateToken(token);
		await validateAccount(token, eventContext);
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
