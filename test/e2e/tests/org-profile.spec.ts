import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';

const profileOf = (orgId: string) => sql('gp_orgs').where({ id: orgId }).first('website', 'description');

test('an org admin edits the website and the description, and the members read them', async ({ org, actors }) => {
	const profile = { website: 'https://example.com/about', description: 'a'.repeat(200) };

	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, profile)).status).toBe(200);
	expect(await profileOf(org.id)).toEqual(profile);

	for (const api of [ actors.member, actors.viewer ]) {
		const response = await api.get(`/items/gp_orgs/${org.id}`, { params: { fields: 'website,description' } });
		expect(response.data.data).toEqual(profile);
	}

	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { website: null, description: null })).status).toBe(200);
	expect(await profileOf(org.id)).toEqual({ website: null, description: null });
});

test('only an org admin edits the profile', async ({ org, actors }) => {
	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.patch(`/items/gp_orgs/${org.id}`, { website: 'https://example.com' })).status).toBe(403);
	}

	expect(await profileOf(org.id)).toEqual({ website: null, description: null });
});

test('the website must be an https URL and the description at most 200 characters', async ({ org, actors }) => {
	for (const website of [ 'https://example.com:8443/x?y=1', 'https://example.com?x=1', 'https://sub.example.co.uk#about' ]) {
		expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { website })).status, website).toBe(200);
	}

	await actors.admin.patch(`/items/gp_orgs/${org.id}`, { website: null });

	for (const website of [ 'http://example.com', 'https://localhost', 'https://exa mple.com', 'example.com', 'https://google.com@evil.com', '' ]) {
		expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { website })).status, website).toBe(400);
	}

	// A long almost-matching value is rejected without the regex backtracking for seconds.
	const started = Date.now();
	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { website: `https://${'a.'.repeat(50_000)} ` })).status).toBe(400);
	expect(Date.now() - started).toBeLessThan(1000);

	expect((await actors.admin.patch(`/items/gp_orgs/${org.id}`, { description: 'a'.repeat(201) })).status).toBe(400);
	expect(await profileOf(org.id)).toEqual({ website: null, description: null });
});
