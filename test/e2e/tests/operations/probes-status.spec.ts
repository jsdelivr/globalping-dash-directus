import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { addProbe } from '../../utils.ts';
import { FLOW, onlineTimesById, trigger } from './shared.ts';

test.afterEach(async ({ org }) => {
	await sql('gp_credits_additions').where({ github_id: org.github_id }).delete();
});

test('counts an online hour for org and personal probes alike, and skips an offline one', async ({ org }) => {
	const orgProbe = await addProbe({ account_id: org.account_id, status: 'ready', onlineTimesToday: 5 });
	const personalProbe = await addProbe({ account_id: org.admin.account_id, userId: org.admin.id, status: 'ready', onlineTimesToday: 5 });
	const offlineProbe = await addProbe({ account_id: org.account_id, status: 'offline', onlineTimesToday: 5 });

	await trigger(FLOW.probesStatus);

	expect(await onlineTimesById([ orgProbe, personalProbe, offlineProbe ])).toEqual({
		[orgProbe]: 6,
		[personalProbe]: 6,
		[offlineProbe]: 5,
	});
});

test('the hour it counts is the one that takes a probe over the threshold and earns the credits', async ({ org }) => {
	const orgProbe = await addProbe({ account_id: org.account_id, status: 'ready', onlineTimesToday: 119 });
	const personalProbe = await addProbe({ account_id: org.admin.account_id, userId: org.admin.id, status: 'ready', onlineTimesToday: 119 });

	// One hour short of the threshold: the credits cron passes both by.
	await trigger(FLOW.adoptedProbesCredits);
	expect(await sql('gp_credits_additions').whereIn('adopted_probe', [ orgProbe, personalProbe ]).select('id')).toHaveLength(0);

	// The status cron counts the missing hour - but it also reset the counters above, so put them back first.
	await sql('gp_probes').whereIn('id', [ orgProbe, personalProbe ]).update({ onlineTimesToday: 119 });
	await trigger(FLOW.probesStatus);

	expect(await onlineTimesById([ orgProbe, personalProbe ])).toEqual({
		[orgProbe]: 120,
		[personalProbe]: 120,
	});

	await trigger(FLOW.adoptedProbesCredits);

	const additions = await sql('gp_credits_additions')
		.whereIn('adopted_probe', [ orgProbe, personalProbe ])
		.select('github_id', 'amount', 'adopted_probe');

	expect(additions).toHaveLength(2);

	expect(additions.find(addition => addition.adopted_probe === orgProbe)).toMatchObject({
		github_id: org.github_id,
		amount: 150,
	});

	expect(additions.find(addition => addition.adopted_probe === personalProbe)).toMatchObject({
		github_id: org.admin.external_identifier,
		amount: 150,
	});
});
