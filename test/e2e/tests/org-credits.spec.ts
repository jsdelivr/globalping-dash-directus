import type { AxiosInstance } from 'axios';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';

const countAccountItems = async (api: AxiosInstance, collection: string, accountId: string) => {
	const response = await api.get(`/items/${collection}?filter[account_id][_eq]=${accountId}`);
	return response.data.data.length as number;
};

const countAdditions = async (api: AxiosInstance, githubId: string) => {
	const response = await api.get(`/items/gp_credits_additions?filter[github_id][_eq]=${githubId}`);
	return response.data.data.length as number;
};

test.afterEach(async ({ org }) => {
	await sql('gp_credits_additions').where({ github_id: org.github_id }).delete();
});

test('org credit additions are readable through Directus by every member of that org and by nobody else', async ({ org, actors }) => {
	await sql('gp_credits_additions').insert({ github_id: org.github_id, amount: 2500, reason: 'one_time_sponsorship', meta: JSON.stringify({ amountInDollars: 10 }), consumed: 0 });

	for (const api of [ actors.admin, actors.member, actors.viewer, actors.directusAdmin ]) {
		expect(await countAdditions(api, org.github_id)).toBe(1);
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect(await countAdditions(api, org.github_id)).toBe(0);
	}
});

test('org credits are readable by every member of that org and by nobody else', async ({ org, actors }) => {
	await sql('gp_credits').insert({ account_id: org.account_id, amount: 1234 });

	for (const api of [ actors.admin, actors.member, actors.viewer, actors.directusAdmin ]) {
		expect(await countAccountItems(api, 'gp_credits', org.account_id)).toBe(1);
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect(await countAccountItems(api, 'gp_credits', org.account_id)).toBe(0);
	}
});

test('personal credits are readable by their owner only', async ({ org, actors }) => {
	await sql('gp_credits').insert({ account_id: org.member.account_id, user_id: org.member.id, amount: 4321 });

	for (const api of [ actors.member, actors.directusAdmin ]) {
		expect(await countAccountItems(api, 'gp_credits', org.member.account_id)).toBe(1);
	}

	for (const api of [ actors.admin, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect(await countAccountItems(api, 'gp_credits', org.member.account_id)).toBe(0);
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

test('the credits timeline of a personal account is available to its owner only', async ({ org, actors }) => {
	expect((await actors.member.get(`/credits-timeline?accountId=${org.member.account_id}`)).status).toBe(200);

	for (const api of [ actors.admin, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get(`/credits-timeline?accountId=${org.member.account_id}`)).status).toBe(400);
	}

	expect((await actors.directusAdmin.get(`/credits-timeline?accountId=${org.member.account_id}`)).status).toBe(200);
});

test('the sponsorship details are scoped to the account', async ({ org, actors }) => {
	for (const api of [ actors.admin, actors.member, actors.viewer, actors.directusAdmin ]) {
		expect((await api.get(`/sponsorship-details?accountId=${org.account_id}`)).status).toBe(200);
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get(`/sponsorship-details?accountId=${org.account_id}`)).status).toBe(400);
	}
});

test('the sponsorship details of a personal account are available to its owner only', async ({ org, actors }) => {
	expect((await actors.member.get(`/sponsorship-details?accountId=${org.member.account_id}`)).status).toBe(200);

	for (const api of [ actors.admin, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.get(`/sponsorship-details?accountId=${org.member.account_id}`)).status).toBe(400);
	}

	expect((await actors.directusAdmin.get(`/sponsorship-details?accountId=${org.member.account_id}`)).status).toBe(200);
});

test('the sponsorship details report the donations of the account, not of the requesting member', async ({ org, actors }) => {
	await sql('gp_credits_additions').insert({
		github_id: org.github_id,
		amount: 2500,
		reason: 'one_time_sponsorship',
		date_created: relativeDayUtc(-15),
		meta: JSON.stringify({ amountInDollars: 10 }),
	});

	const orgDetails = await actors.member.get(`/sponsorship-details?accountId=${org.account_id}`);
	expect(orgDetails.status).toBe(200);
	expect(orgDetails.data.donatedInLastYear).toBe(10);

	const personalDetails = await actors.member.get(`/sponsorship-details?accountId=${org.member.account_id}`);
	expect(personalDetails.status).toBe(200);
	expect(personalDetails.data.donatedInLastYear).toBe(0);
});

test('the credits timeline of an org holds its own records only, and so does the personal one of a member', async ({ org, actors }) => {
	await sql('gp_credits_deductions').insert([
		{ account_id: org.account_id, amount: 111, date: '2025-01-01' },
		{ account_id: org.member.account_id, user_id: org.member.id, amount: 222, date: '2025-01-01' },
	]);

	await sql('gp_credits_additions').insert([
		{ github_id: org.github_id, amount: 333, reason: 'one_time_sponsorship', date_created: relativeDayUtc(-10), meta: JSON.stringify({ amountInDollars: 3 }) },
		{ github_id: org.member.external_identifier, amount: 444, reason: 'one_time_sponsorship', date_created: relativeDayUtc(-10), meta: JSON.stringify({ amountInDollars: 4 }) },
	]);

	const amountsOf = async (accountId: string) => {
		const response = await actors.member.get(`/credits-timeline?accountId=${accountId}&limit=100`);
		expect(response.status).toBe(200);
		return (response.data.changes as { amount: number }[]).map(change => change.amount).sort((a, b) => a - b);
	};

	expect(await amountsOf(org.account_id)).toEqual([ 111, 333 ]);
	expect(await amountsOf(org.member.account_id)).toEqual([ 222, 444 ]);
});

