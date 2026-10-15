import type { OperationContext } from '@directus/extensions';

type AdoptedProbe = {
	id: string;
	name: string | null;
	ip: string;
	onlineTimesToday: number;
	githubId: string | null;
};

// The additions are stored per github id, so the owner's one comes with the probes: a user account resolves to the user, an org
// account to the org.
export const getAdoptedProbes = async ({ database }: OperationContext) => {
	const [ rows ] = await database.raw(`
		SELECT p.id, p.name, p.ip, p.onlineTimesToday, COALESCE(u.external_identifier, o.github_id) AS githubId
		FROM gp_probes p
		JOIN gp_accounts a ON a.id = p.account_id
		LEFT JOIN directus_users u ON a.user = u.id
		LEFT JOIN gp_orgs o ON a.org = o.id
	`) as [AdoptedProbe[]];

	return rows;
};

export const addProbeCredits = async (adoptedProbes: AdoptedProbe[], { services, getSchema, env }: OperationContext) => {
	if (!env.CREDITS_PER_ADOPTED_PROBE_DAY) {
		throw new Error('CREDITS_PER_ADOPTED_PROBE_DAY was not provided');
	}

	if (adoptedProbes.length === 0) {
		return [];
	}

	const { ItemsService } = services;

	const creditsAdditionsService = new ItemsService('gp_credits_additions', {
		schema: await getSchema(),
	});

	const result = await creditsAdditionsService.createMany(adoptedProbes.map(({ id, githubId, ip, name }) => ({
		github_id: githubId,
		amount: parseInt(env.CREDITS_PER_ADOPTED_PROBE_DAY, 10),
		reason: 'adopted_probe',
		meta: {
			id,
			ip,
			name: name ?? null,
		},
		adopted_probe: id,
	}))) as number[];

	return result;
};

export const resetOnlineTimes = async ({ services, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const itemsService = new ItemsService('gp_probes', {
		schema: await getSchema(),
	});

	await itemsService.updateByQuery({}, { onlineTimesToday: 0 }, { emitEvents: false });
};
