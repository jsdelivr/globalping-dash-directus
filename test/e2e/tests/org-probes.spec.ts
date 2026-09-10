import axios, { type AxiosInstance } from 'axios';
import relativeDayUtc from 'relative-day-utc';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';
import { addProbe, getAdoptionCode, pageAs, prepareMockProbeByIp, randomIP, randomToken } from '../utils.ts';

const EXPIRED_PROBES_FLOW_ID = '176fb9aa-ba3c-44c9-97f8-78f1078eb554';
const OUTDATED_FIRMWARE_FLOW_ID = 'c76af4f0-229f-4ec3-a576-32958db2ed44';

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
	await prepareMockProbeByIp(ip);

	// Every check runs before the probe is adopted: afterwards the endpoint would reject the IP as already adopted instead.
	for (const api of [ actors.member, actors.viewer, actors.outsider, actors.otherOrgAdmin ]) {
		expect((await api.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(400);
	}

	expect((await actors.admin.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(200);
	expect((await actors.directusAdmin.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(200);

	expect((await actors.admin.post('/adoption-code/verify-code', { accountId: org.account_id, code: await getAdoptionCode(ip) })).status).toBe(200);

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

test('An org probe is not offered for adoption again', async ({ org, actors }) => {
	const ip = randomIP();
	await prepareMockProbeByIp(ip);

	expect((await actors.admin.post('/adoption-code/send-code', { accountId: org.account_id, ip })).status).toBe(200);
	expect((await actors.admin.post('/adoption-code/verify-code', { accountId: org.account_id, code: await getAdoptionCode(ip) })).status).toBe(200);

	// The owner is the org, so the probe has no `userId` - the guard has to see it as adopted all the same.
	const admin = await actors.admin.post('/adoption-code/send-code', { accountId: org.account_id, ip });
	expect(admin.status).toBe(400);
	expect(admin.data).toBe('The probe with this IP address is already adopted');

	// The rest never get that far: acting for the org is not theirs to do.
	for (const api of [ actors.member, actors.outsider ]) {
		const response = await api.post('/adoption-code/send-code', { accountId: org.account_id, ip });
		expect(response.status).toBe(400);
		expect(response.data).toBe('You can not access this account.');
	}
});

test('An org probe is not offered for local adoption', async ({ org, actors }) => {
	const ip = randomIP();
	const token = randomToken();

	await addProbe({
		account_id: org.account_id,
		ip,
		localAdoptionServer: JSON.stringify({ token, ips: [ '192.168.0.10' ] }),
	});

	const listed = await actors.admin.get('/local-adoption', { headers: { 'true-client-ip': ip } });
	expect(listed.data).toEqual([]);

	const adopted = await actors.outsider.post('/local-adoption/adopt', { token }, { headers: { 'true-client-ip': ip } });
	expect(adopted.status).toBe(404);

	const probe = await sql('gp_probes').where({ ip }).first('account_id');
	expect(probe.account_id).toBe(org.account_id);
});

test('An org probe is tagged with the org name only', async ({ org, actors }) => {
	const probeId = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe' });

	const accepted = await actors.admin.patch(`/items/gp_probes/${probeId}`, { tags: [{ prefix: org.name, value: 'berlin' }] });
	expect(accepted.status).toBe(200);

	// The admin's own GitHub names are not valid prefixes for a probe owned by the org.
	const rejected = await actors.admin.patch(`/items/gp_probes/${probeId}`, { tags: [{ prefix: org.admin.github_username, value: 'berlin' }] });
	expect(rejected.status).toBe(400);

	const probe = await sql('gp_probes').where({ id: probeId }).first('tags');
	expect(JSON.parse(probe.tags)).toEqual([{ prefix: org.name, value: 'berlin' }]);
});

test('The expired probes cron removes an org probe that stayed offline', async ({ org }) => {
	const expiredId = await addProbe({
		account_id: org.account_id,
		name: 'e2e-org-probe-expired',
		status: 'offline',
		lastSyncDate: relativeDayUtc(-31),
	});

	const keptId = await addProbe({
		account_id: org.account_id,
		name: 'e2e-org-probe-kept',
		status: 'offline',
		lastSyncDate: relativeDayUtc(-3),
	});

	await axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${EXPIRED_PROBES_FLOW_ID}`);

	expect(await sql('gp_probes').where({ id: expiredId }).first('id')).toBe(undefined);
	const kept = await sql('gp_probes').where({ id: keptId }).first('account_id');
	expect(kept.account_id).toBe(org.account_id);

	// Both the deletion and the warning are addressed to the org admins.
	const notifications = await sql('directus_notifications')
		.whereIn('type', [ 'probe_unassigned', 'offline_probe' ])
		.whereIn('recipient', [ org.admin.id, org.member.id, org.viewer.id ])
		.select('type', 'recipient');

	expect(notifications.map(n => n.recipient)).toEqual([ org.admin.id, org.admin.id ]);
	expect(notifications.map(n => n.type).sort()).toEqual([ 'offline_probe', 'probe_unassigned' ]);
});

test('The offline warning for an org probe is sent once and not repeated on the next cron run', async ({ org }) => {
	const probeId = await addProbe({
		account_id: org.account_id,
		name: 'e2e-org-probe-offline',
		status: 'offline',
		lastSyncDate: relativeDayUtc(-3),
	});

	await axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${EXPIRED_PROBES_FLOW_ID}`);
	await axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${EXPIRED_PROBES_FLOW_ID}`);

	const warnings = await sql('directus_notifications')
		.where({ type: 'offline_probe', recipient: org.admin.id })
		.select('collection', 'item');

	// One warning for the admin across both runs; the second run dedups on the item the notification carries.
	expect(warnings).toEqual([{ collection: 'gp_probes', item: probeId }]);
});

test('The outdated software warning for an org probe is sent once and not repeated on the next cron run', async ({ org }) => {
	const outdatedProbeId = await addProbe({
		account_id: org.account_id,
		name: 'e2e-org-probe-outdated',
		nodeVersion: 'v1.0.0',
	});

	await axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${OUTDATED_FIRMWARE_FLOW_ID}`);
	await axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${OUTDATED_FIRMWARE_FLOW_ID}`);

	const warnings = await sql('directus_notifications')
		.where({ type: 'outdated_software', recipient: org.admin.id })
		.select('collection', 'item');

	// One warning for the admin across both runs; the second run dedups on the item the notification carries.
	expect(warnings).toEqual([{ collection: 'gp_probes', item: outdatedProbeId }]);
});

test('An org probe is not listed in the admin`s personal probes list', async ({ browser, org }) => {
	await addProbe({ account_id: org.account_id, name: 'e2e-probe-of-the-org' });
	await addProbe({ account_id: org.admin.account_id, userId: org.admin.id, name: 'e2e-probe-of-the-admin' });

	const page = await pageAs(browser, org.admin.email, 'user');
	await page.goto('/probes');

	await expect(page.getByText('e2e-probe-of-the-admin').first()).toBeVisible();
	await expect(page.getByText('e2e-probe-of-the-org')).toHaveCount(0);
});
