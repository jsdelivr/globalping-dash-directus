import type { ApiExtensionContext } from '@directus/extensions';

type Probe = {
	id?: string;
	country?: string | null;
	city?: string | null;
};

const findAdoptedProbes = async (filter: Record<string, unknown>, { services, getSchema, database }: ApiExtensionContext) => {
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const probes = await itemsService.readByQuery({
		filter,
	}) as Probe[];

	return probes;
};

export const getDefaultProbeName = async (userId: string, probe: Probe, context: ApiExtensionContext) => {
	let name = null;
	const namePrefix = probe.country && probe.city ? `probe-${probe.country.toLowerCase().replaceAll(' ', '-')}-${probe.city.toLowerCase().replaceAll(' ', '-')}` : null;

	if (namePrefix) {
		const currentProbes = await findAdoptedProbes({
			userId,
			country: probe.country,
			city: probe.city,
		}, context);
		const otherProbes = currentProbes.filter(({ id }) => id !== probe.id);
		name = `${namePrefix}-${(otherProbes.length + 1).toString().padStart(2, '0')}`;
	}

	return name;
};
