import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { addProbe } from '../../utils.ts';
import { FLOW, onlineTimesById, trigger } from './shared.ts';

// Additions are keyed by github_id alone, so neither the org fixture nor the cascade of a deleted org reaches them.
test.afterEach(async ({ org }) => {
	await sql.raw('DROP TRIGGER IF EXISTS test_reject_probe_grant');
	await sql('gp_credits_additions').where({ github_id: org.github_id }).delete();
});

test('a failed grant rolls back credits and counters, then succeeds once on the next run', async ({ org }) => {
	const first = await addProbe({ account_id: org.account_id, onlineTimesToday: 120 });
	const second = await addProbe({ account_id: org.account_id, onlineTimesToday: 120 });
	await sql.raw(`CREATE TRIGGER test_reject_probe_grant BEFORE INSERT ON gp_credits_additions
		FOR EACH ROW BEGIN
			IF NEW.adopted_probe = ? THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test failed grant'; END IF;
		END`, [ [ first, second ].sort()[1] ]);

	await trigger(FLOW.adoptedProbesCredits);
	expect(await sql('gp_credits_additions').whereIn('adopted_probe', [ first, second ])).toHaveLength(0);
	expect(await onlineTimesById([ first, second ])).toEqual({ [first]: 120, [second]: 120 });
	expect(await sql('gp_credits').where({ account_id: org.account_id })).toHaveLength(0);

	await sql.raw('DROP TRIGGER test_reject_probe_grant');
	await Promise.all([ trigger(FLOW.adoptedProbesCredits), trigger(FLOW.adoptedProbesCredits) ]);
	expect(await sql('gp_credits_additions').whereIn('adopted_probe', [ first, second ])).toHaveLength(2);
	expect((await sql('gp_credits').where({ account_id: org.account_id }).first('amount')).amount).toBe(300);
	expect(await onlineTimesById([ first, second ])).toEqual({ [first]: 0, [second]: 0 });
});

test('credits the owner of the probe: the org for an org probe, the user for a personal one', async ({ org }) => {
	await sql('gp_probes').update({ onlineTimesToday: 0 });

	const orgProbe = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe', onlineTimesToday: 120 });
	const personalProbe = await addProbe({ account_id: org.admin.account_id, name: 'e2e-personal-probe', onlineTimesToday: 120 });
	const idleProbe = await addProbe({ account_id: org.account_id, name: 'e2e-idle-probe', onlineTimesToday: 119 });
	const nonGithubProbe = await addProbe({ account_id: org.viewer.account_id, onlineTimesToday: 120 });
	await sql('directus_users').where({ id: org.viewer.id }).update({ external_identifier: null });

	const response = await trigger(FLOW.adoptedProbesCredits);

	const additions = await sql('gp_credits_additions')
		.whereIn('adopted_probe', [ orgProbe, personalProbe, idleProbe, nonGithubProbe ])
		.select('id', 'github_id', 'amount', 'reason', 'adopted_probe', 'meta', 'date_created').orderBy('id');

	expect(additions).toHaveLength(2);
	expect(response.data.adopted_probes_credits_manual_handler).toBe(`Created credits with ids: ${additions.map(addition => addition.id).join(',')}`);
	expect((await trigger(FLOW.adoptedProbesCredits)).data.adopted_probes_credits_manual_handler).toBe('No credits created');

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

	const orgAddition = additions.find(addition => addition.adopted_probe === orgProbe);
	expect(JSON.parse(orgAddition.meta)).toMatchObject({ id: orgProbe, name: 'e2e-org-probe' });
	expect(orgAddition.date_created).not.toBeNull();

	// The probe that stayed under the online threshold earns nothing.
	expect(additions.some(addition => addition.adopted_probe === idleProbe)).toBe(false);

	// The credits land on the account the addition resolves to, so the org keeps what its own probe earned.
	const orgCredits = await sql('gp_credits').where({ account_id: org.account_id }).first('amount');
	expect(orgCredits.amount).toBe(150);

	const personalCredits = await sql('gp_credits').where({ account_id: org.admin.account_id }).first('amount');
	expect(personalCredits.amount).toBe(150);

	// Every probe starts the next day from zero, credited or not.
	expect(await onlineTimesById([ orgProbe, personalProbe, idleProbe, nonGithubProbe ])).toEqual({
		[orgProbe]: 0,
		[personalProbe]: 0,
		[idleProbe]: 0,
		[nonGithubProbe]: 0,
	});

	const probes = await sql('gp_probes').whereIn('id', [ orgProbe, personalProbe, idleProbe, nonGithubProbe ]).select('date_updated');
	expect(probes.every(probe => probe.date_updated !== null)).toBe(true);
});

test('gives an org probe nothing when the org has no members left to own it', async ({ org }) => {
	const orgProbe = await addProbe({ account_id: org.account_id, name: 'e2e-org-probe', onlineTimesToday: 120 });

	await sql('gp_org_members').where({ org: org.id }).delete();
	await trigger(FLOW.adoptedProbesCredits);

	// The addition follows the org's own github id, so an empty org still earns for its probes.
	const addition = await sql('gp_credits_additions').where({ adopted_probe: orgProbe }).first('github_id', 'amount');
	expect(addition).toMatchObject({ github_id: org.github_id, amount: 150 });
});
