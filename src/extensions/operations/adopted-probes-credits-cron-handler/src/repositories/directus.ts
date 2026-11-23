import type { OperationContext } from '@directus/extensions';

type AdoptedProbe = {
	id: string;
	name: string | null;
	ip: string;
	onlineTimesToday: number;
	githubId: string | null;
};

export const grantProbeCredits = async ({ database }: OperationContext, amount: number, requiredOnlineTimes: number): Promise<number[]> => database.transaction(async (trx) => {
	// Follow the account -> probe order of account deletion cascades, without locking parent users or orgs.
	await trx('gp_accounts').select('id').orderBy('id').forShare();
	const lockedProbes = await trx<{ id: string }>('gp_probes').select('id').orderBy('id').forUpdate();
	const probeIds = lockedProbes.map(probe => probe.id);

	if (!probeIds.length) {
		return [];
	}

	const probes = await trx('gp_probes as p')
		.join('gp_accounts as a', 'a.id', 'p.account_id')
		.leftJoin('directus_users as u', 'a.user', 'u.id')
		.leftJoin('gp_orgs as o', 'a.org', 'o.id')
		.whereIn('p.id', probeIds).orderBy('p.id')
		.select<AdoptedProbe[]>('p.id', 'p.name', 'p.ip', 'p.onlineTimesToday', trx.raw('COALESCE(u.external_identifier, o.github_id) AS githubId'));
	const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
	const additions = probes
		.filter(probe => probe.githubId && probe.onlineTimesToday >= requiredOnlineTimes)
		.map(({ id, githubId, ip, name }) => ({
			github_id: githubId!,
			amount,
			reason: 'adopted_probe',
			meta: JSON.stringify({ id, ip, name: name ?? null }),
			adopted_probe: id,
			date_created: createdAt,
		}));

	// Reset before acquiring wallet locks. Both changes commit together, so a failed run grants nothing and loses no counters.
	await trx('gp_probes').whereIn('id', probeIds).update({ onlineTimesToday: 0, date_updated: trx.fn.now() });

	if (!additions.length) {
		return [];
	}

	// Plain INSERT preserves the ledger's accounting trigger. RETURNING gives actual IDs without assuming consecutive values.
	const { sql, bindings } = trx('gp_credits_additions').insert(additions).toSQL();
	const [ rows ] = await trx.raw(`${sql} RETURNING id`, bindings) as [{ id: number }[]];
	return rows.map(({ id }) => id);
}, { isolationLevel: 'read committed' });
