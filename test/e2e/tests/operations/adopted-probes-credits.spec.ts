import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { addProbe } from '../../utils.ts';
import { FLOW, onlineTimesById, trigger } from './shared.ts';

// Additions are keyed by github_id alone, so neither the org fixture nor the cascade of a deleted org reaches them.
test.afterEach(async ({ org }) => {
	await sql('gp_credits_additions').where({ github_id: org.github_id }).delete();
});

test('credits the owner of the probe: the org for an org probe, the user for a personal one', async ({ org }) => {
	const orgProbe = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe', onlineTimesToday: 120 });
	const personalProbe = await addProbe({ account_id: org.admin.account_id, userId: org.admin.id, name: 'e2e-personal-probe', onlineTimesToday: 120 });
	const idleProbe = await addProbe({ account_id: org.account_id, name: 'e2e-idle-probe', onlineTimesToday: 119 });

	await trigger(FLOW.adoptedProbesCredits);

	const additions = await sql('gp_credits_additions')
		.whereIn('adopted_probe', [ orgProbe, personalProbe, idleProbe ])
		.select('github_id', 'amount', 'reason', 'adopted_probe');

	expect(additions).toHaveLength(2);

	expect(additions.find(addition => addition.adopted_probe === orgProbe)).toMatchObject({
		github_id: org.github_id,
		amount: 150,
		reason: 'adopted_probe',
	});

	expect(additions.find(addition => addition.adopted_probe === personalProbe)).toMatchObject({
		github_id: org.admin.external_identifier,
		amount: 150,
		reason: 'adopted_probe',
	});

	// The probe that stayed under the online threshold earns nothing.
	expect(additions.some(addition => addition.adopted_probe === idleProbe)).toBe(false);

	// The credits land on the account the addition resolves to, so the org keeps what its own probe earned.
	const orgCredits = await sql('gp_credits').where({ account_id: org.account_id }).first('amount');
	expect(orgCredits.amount).toBe(150);

	const personalCredits = await sql('gp_credits').where({ account_id: org.admin.account_id }).first('amount');
	expect(personalCredits.amount).toBe(150);

	// Every probe starts the next day from zero, credited or not.
	expect(await onlineTimesById([ orgProbe, personalProbe, idleProbe ])).toEqual({
		[orgProbe]: 0,
		[personalProbe]: 0,
		[idleProbe]: 0,
	});
});

test('gives an org probe nothing when the org has no members left to own it', async ({ org }) => {
	const orgProbe = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe', onlineTimesToday: 120 });

	await sql('gp_org_members').where({ org: org.id }).delete();
	await trigger(FLOW.adoptedProbesCredits);

	// The addition follows the org's own github id, so an empty org still earns for its probes.
	const addition = await sql('gp_credits_additions').where({ adopted_probe: orgProbe }).first('github_id', 'amount');
	expect(addition).toMatchObject({ github_id: org.github_id, amount: 150 });
});
