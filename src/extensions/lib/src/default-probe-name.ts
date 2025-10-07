import type { ApiExtensionContext } from '@directus/extensions';
import type { Filter } from '@directus/types';

type Probe = {
	id?: string;
	name: string | null;
	country: string;
	city: string;
};

const findAdoptedProbes = async (filter: Filter, { services, getSchema, database }: ApiExtensionContext) => {
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const probes = await itemsService.readByQuery({
		filter,
	}) as Probe[];

	return probes;
};

export const getDefaultProbeName = async (userId: string, probe: { id?: string; country: string; city: string }, context: ApiExtensionContext) => {
	const prefix = `probe-${probe.country.toLowerCase().replaceAll(' ', '-')}-${probe.city.toLowerCase().replaceAll(' ', '-')}`;

	const currentProbes = await findAdoptedProbes({
		userId: { _eq: userId },
		country: { _eq: probe.country },
		city: { _eq: probe.city },
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
