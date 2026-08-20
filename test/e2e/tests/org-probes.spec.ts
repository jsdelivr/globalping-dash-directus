import { randomUUID } from 'node:crypto';
import type { AxiosInstance } from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { Org } from '../types.ts';
import { randomIP } from '../utils.ts';

const defaultProbe = {
	uuid: '7bac0b3a-f808-48e1-8892-062bab3280f8',
	asn: 3302,
	city: 'Ouagadougou',
	country: 'BF',
	countryName: 'Burkina Faso',
	continent: 'AF',
	continentName: 'Africa',
	region: 'Western Africa',
	date_created: new Date(),
	lastSyncDate: new Date(),
	latitude: 12.37,
	longitude: -1.53,
	network: 'IRIDEOS S.P.A.',
	onlineTimesToday: 50,
	state: null,
	status: 'ready',
	userId: null,
	version: '0.28.0',
	nodeVersion: 'v22.22.3',
	hardwareDevice: null,
	allowedCountries: JSON.stringify([ 'BF' ]),
	customLocation: null,
};

const listedProbeIds = async (api: AxiosInstance) => {
	const response = await api.get('/items/gp_probes');
	return response.data.data.map((probe: { id: string }) => probe.id);
};

const addOrgProbe = async (org: Org) => {
	const probeId = randomUUID();

	await sql('gp_probes').insert({
		...defaultProbe,
		id: probeId,
		ip: randomIP(),
		uuid: randomUUID(),
		name: 'e2e-org-probe',
		account_id: org.account_id,
	});

	return probeId;
};

test('Org probes are readable by every member of that org and by nobody else', async ({ org, actors }) => {
	const probeId = await addOrgProbe(org);

	for (const api of [ actors.admin, actors.member, actors.viewer, actors.directusAdmin ]) {
		expect(await listedProbeIds(api)).toContain(probeId);
	}

	for (const api of [ actors.outsider, actors.otherOrgAdmin ]) {
		expect(await listedProbeIds(api)).not.toContain(probeId);
	}
});

test('Org probe adoption is available to admins only', async ({ org, actors }) => {
	const ip = randomIP();

	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(400);
	}

	expect((await actors.directusAdmin.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(200);

	expect((await actors.admin.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(200);
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
	const probeId = await addOrgProbe(org);

	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.patch(`/items/gp_probes/${probeId}`, { name: 'e2e-renamed-probe' })).status).toBe(403);
	}

	expect((await actors.admin.patch(`/items/gp_probes/${probeId}`, { name: 'e2e-renamed-probe' })).status).toBe(200);
	// Rejected by the permission validation, not by the permission itself - hence 400.
	expect((await actors.admin.patch(`/items/gp_probes/${probeId}`, { account_id: org.admin.account_id })).status).toBe(400);

	const probe = await sql('gp_probes').where({ id: probeId }).first('name', 'account_id');
	expect(probe.name).toBe('e2e-renamed-probe');
	expect(probe.account_id).toBe(org.account_id);

	// The validation is a part of the user policy, so a Directus admin can reassign a probe - that is how support moves one.
	expect((await actors.directusAdmin.patch(`/items/gp_probes/${probeId}`, { account_id: org2.account_id })).status).toBe(200);

	const movedProbe = await sql('gp_probes').where({ id: probeId }).first('account_id');
	expect(movedProbe.account_id).toBe(org2.account_id);
});
