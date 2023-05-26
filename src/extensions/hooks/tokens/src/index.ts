import { defineHook } from '@directus/extensions-sdk';

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

type Revision = {
    data: Token;
    delta: Token;
};

export default defineHook(({ action }) => {
	action('tokens.items.read', (query) => {
        const payload = query.payload as Token[];
		payload.forEach(item => {
			if (item.value) {
				item.value = '********';
			}
		});
	});

	action('revisions.read', (query) => {
        const payload = query.payload as Revision[];
		payload.forEach(item => {
			if (item.data?.value) {
				item.data.value = '********';
			}

			if (item.delta?.value) {
				item.delta.value = '********';
			}
		});
	});
});
