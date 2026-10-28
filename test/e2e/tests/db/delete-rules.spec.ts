import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { addProbe, generateUser, randomToken } from '../../utils.ts';

const probeIds: string[] = [];

const addToken = async (userId: string, accountId: string) => {
	const [ id ] = await sql('gp_tokens').insert({
		name: 'e2e-token',
		value: randomToken(),
		origins: JSON.stringify([]),
		user_created: userId,
		account_id: accountId,
	});

	return id as number;
};

const addApp = async (userId: string) => {
	const id = randomUUID();

	await sql('gp_apps').insert({
		id,
		user_created: userId,
		name: 'e2e-app',
		secrets: JSON.stringify([]),
		grants: JSON.stringify([ 'authorization_code' ]),
		redirect_urls: JSON.stringify([ 'http://localhost:13010' ]),
	});

	return id;
};

test.afterEach(async () => {
	await sql('gp_probes').whereIn('id', probeIds).delete();
	probeIds.length = 0;
});

test('Deleting a user removes their account and everything that hangs on it', async () => {
	const user = await generateUser('Deleted');
	const tokenId = await addToken(user.id, user.account_id);
	await sql('gp_credits').insert({ account_id: user.account_id, user_id: user.id, amount: 1000 });
	const probeId = await addProbe({ account_id: user.account_id, userId: user.id });
	probeIds.push(probeId);

	await sql('directus_users').where({ id: user.id }).delete();

	expect(await sql('gp_accounts').where({ id: user.account_id }).first('id')).toBeUndefined();
	expect(await sql('gp_tokens').where({ id: tokenId }).first('id')).toBeUndefined();
	expect(await sql('gp_credits').where({ account_id: user.account_id }).first('id')).toBeUndefined();

	// The probe itself outlives its owner, it just becomes unassigned.
	const probe = await sql('gp_probes').where({ id: probeId }).first('userId', 'account_id');
	expect(probe.userId).toBe(null);
	expect(probe.account_id).toBe(null);
});

test('Deleting an org removes its account, its memberships and everything that hangs on them', async ({ org }) => {
	const tokenId = await addToken(org.admin.id, org.account_id);
	await sql('gp_credits').insert({ account_id: org.account_id, amount: 1000 });
	const probeId = await addProbe({ account_id: org.account_id });
	probeIds.push(probeId);

	await sql('gp_orgs').where({ id: org.id }).delete();

	expect(await sql('gp_accounts').where({ id: org.account_id }).first('id')).toBeUndefined();
	expect(await sql('gp_org_members').where({ org: org.id }).first('id')).toBeUndefined();
	expect(await sql('gp_tokens').where({ id: tokenId }).first('id')).toBeUndefined();
	expect(await sql('gp_credits').where({ account_id: org.account_id }).first('id')).toBeUndefined();

	const probe = await sql('gp_probes').where({ id: probeId }).first('account_id');
	expect(probe.account_id).toBe(null);

	// The members themselves stay, they only lose the org.
	expect(await sql('directus_users').where({ id: org.admin.id }).first('id')).toBeTruthy();
});

// Tokens and approvals hang on the org account, which survives a member leaving, so there is nothing for a cascade to follow:
// an AFTER DELETE trigger on the membership cleans them up instead.
test('Leaving an org removes the tokens and the approvals of that member in it', async ({ org }) => {
	const app = await addApp(org.member.id);
	const orgToken = await addToken(org.member.id, org.account_id);
	const personalToken = await addToken(org.member.id, org.member.account_id);
	const adminToken = await addToken(org.admin.id, org.account_id);

	const orgApproval = randomUUID();
	await sql('gp_apps_approvals').insert({ id: orgApproval, user_created: org.member.id, account_id: org.account_id, app, scopes: JSON.stringify([ 'measurements' ]) });

	const personalApproval = randomUUID();
	await sql('gp_apps_approvals').insert({ id: personalApproval, user_created: org.member.id, account_id: org.member.account_id, app, scopes: JSON.stringify([ 'measurements' ]) });

	await sql('gp_org_members').where({ org: org.id, user: org.member.id }).delete();

	expect(await sql('gp_tokens').where({ id: orgToken }).first('id')).toBeUndefined();
	expect(await sql('gp_apps_approvals').where({ id: orgApproval }).first('id')).toBeUndefined();

	// What the member has outside the org, and what the other members have inside it, is untouched.
	expect(await sql('gp_tokens').where({ id: personalToken }).first('id')).toBeTruthy();
	expect(await sql('gp_apps_approvals').where({ id: personalApproval }).first('id')).toBeTruthy();
	expect(await sql('gp_tokens').where({ id: adminToken }).first('id')).toBeTruthy();
});
