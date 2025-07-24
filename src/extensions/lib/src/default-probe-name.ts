import type { ApiExtensionContext } from '@directus/extensions';

type Probe = {
	id?: string;
	country?: string | null;
	city?: string | null;
	name?: string | null;
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
	if (!probe.country || !probe.city) {
		return null;
	}

	const prefix = `probe-${probe.country.toLowerCase().replaceAll(' ', '-')}-${probe.city.toLowerCase().replaceAll(' ', '-')}`;

	const currentProbes = await findAdoptedProbes({
		userId,
		country: probe.country,
		city: probe.city,
	}, context);
	const otherProbes = currentProbes.filter(({ id }) => id !== probe.id);

	const regex = new RegExp(`^${prefix}-(\\d+)$`);
	let maxIndex = otherProbes.length;

	for (const { name } of otherProbes) {
		const match = name?.match(regex);

		if (match) {
			const index = parseInt(match[1]!, 10);

			if (index > maxIndex) { maxIndex = index; }
		}
	}

	const newIndex = (maxIndex + 1).toString().padStart(2, '0');

	return `${prefix}-${newIndex}`;
};
