import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { addProbe, randomIP } from '../utils.ts';

const listedProbeIds = async (api: AxiosInstance) => {
	const response = await api.get('/items/gp_probes');
	return response.data.data.map((probe: { id: string }) => probe.id);
};

test('Org probes are readable by every member of that org and by nobody else', async ({ org, actors }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });

	for (const api of [ actors.admin, actors.member, actors.viewer, actors.directusAdmin ]) {
		expect(await listedProbeIds(api)).toContain(probeId);
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect(await listedProbeIds(api)).not.toContain(probeId);
	}
});

test('Personal probes are readable by their owner only', async ({ org, actors }) => {
	const orgProbeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });
	const personalProbeId = await addProbe({ account_id: org.member.account_id, userId: org.member.id, name: 'e2e-personal-probe' });

	// The member sees both their own probe and the one of the org.
	for (const api of [ actors.member, actors.directusAdmin ]) {
		expect(await listedProbeIds(api)).toEqual(expect.arrayContaining([ orgProbeId, personalProbeId ]));
	}

	for (const api of [ actors.admin, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect(await listedProbeIds(api)).not.toContain(personalProbeId);
	}
});

test('A personal probe can only be edited by its owner, and never moved to another account', async ({ org, actors }) => {
	const probeId = await addProbe({ account_id: org.member.account_id, userId: org.member.id, name: 'e2e-personal-probe' });

	expect((await actors.member.patch(`/items/gp_probes/${probeId}`, { name: 'e2e-renamed-probe' })).status).toBe(200);

	// Being an admin of the org the user belongs to gives no access to their personal probe.
	for (const api of [ actors.admin, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.patch(`/items/gp_probes/${probeId}`, { name: 'e2e-renamed-by-somebody-else' })).status).toBe(403);
	}

	// The owner can not give the probe away either.
	expect((await actors.member.patch(`/items/gp_probes/${probeId}`, { account_id: org.account_id })).status).toBe(400);

	const probe = await sql('gp_probes').where({ id: probeId }).first('name', 'account_id');
	expect(probe.name).toBe('e2e-renamed-probe');
	expect(probe.account_id).toBe(org.member.account_id);
});

test('Org probe adoption is available to admins only', async ({ org, actors }) => {
	const ip = randomIP();

	// Every check runs before the probe is adopted: afterwards the endpoint would reject the IP as already adopted instead.
	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(400);
	}

	expect((await actors.admin.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(200);
	expect((await actors.directusAdmin.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(200);

	expect((await actors.admin.post('/adoption-code/verify-code', { accountId: org.account_id, code: '111111' })).status).toBe(200);

	const probe = await sql('gp_probes').where({ ip }).first('account_id', 'userId');
	expect(probe.account_id).toBe(org.account_id);
	expect(probe.userId).toBe(null);

	// The adoption notification goes to the org admins.
	const notified = await sql('directus_notifications')
		.where({ type: 'probe_adopted' })
		.whereIn('recipient', [ org.admin.id, org.member.id, org.viewer.id ])
		.select('recipient');
	expect(notified.map(notification => notification.recipient)).toEqual([ org.admin.id ]);
});

test('An org probe can only be edited by an admin, and never moved to another account', async ({ org, org2, actors }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });

	expect((await actors.admin.patch(`/items/gp_probes/${probeId}`, { name: 'e2e-renamed-probe' })).status).toBe(200);

	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.patch(`/items/gp_probes/${probeId}`, { name: 'e2e-renamed-by-somebody-else' })).status).toBe(403);
	}

	// Nobody moves a probe between accounts: the roles without an update permission are stopped by it, the admin by the
	// validation that comes with it - hence 403 for them and 400 for the admin.
	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.patch(`/items/gp_probes/${probeId}`, { account_id: org2.account_id })).status).toBe(403);
	}

	expect((await actors.admin.patch(`/items/gp_probes/${probeId}`, { account_id: org.admin.account_id })).status).toBe(400);

	const probe = await sql('gp_probes').where({ id: probeId }).first('name', 'account_id');
	expect(probe.name).toBe('e2e-renamed-probe');
	expect(probe.account_id).toBe(org.account_id);

	// The validation is a part of the user policy, so a Directus admin can reassign a probe - that is how support moves one.
	expect((await actors.directusAdmin.patch(`/items/gp_probes/${probeId}`, { account_id: org2.account_id })).status).toBe(200);

	const movedProbe = await sql('gp_probes').where({ id: probeId }).first('account_id');
	expect(movedProbe.account_id).toBe(org2.account_id);
});
