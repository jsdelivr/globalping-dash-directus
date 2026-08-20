import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';

const countAccountItems = async (api: AxiosInstance, collection: string, accountId: string) => {
	const response = await api.get(`/items/${collection}?filter[account_id][_eq]=${accountId}`);
	return response.data.data.length as number;
};

test('org credits are readable by every member of that org and by nobody else', async ({ org, actors }) => {
	await sql('gp_credits').insert({ account_id: org.account_id, amount: 1234 });

	for (const api of [ actors.admin, actors.member, actors.viewer, actors.directusAdmin ]) {
		expect(await countAccountItems(api, 'gp_credits', org.account_id)).toBe(1);
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect(await countAccountItems(api, 'gp_credits', org.account_id)).toBe(0);
	}
});

test('the credits timeline is scoped to the account', async ({ org, actors }) => {
	for (const api of [ actors.admin, actors.member, actors.viewer, actors.directusAdmin ]) {
		expect((await api.get(`/credits-timeline?accountId=${org.account_id}`)).status).toBe(200);
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get(`/credits-timeline?accountId=${org.account_id}`)).status).toBe(400);
	}

	for (const api of [ actors.admin, actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get('/credits-timeline?accountId=all')).status).toBe(400);
	}

	expect((await actors.directusAdmin.get('/credits-timeline?accountId=all')).status).toBe(200);
});
