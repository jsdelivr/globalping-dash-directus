import type { EndpointExtensionContext } from '@directus/extensions';
import _ from 'lodash';
import type { AdoptedProbe, ProbeToAdopt } from '../index.js';

export const createAdoptedProbe = async (userId: string, probe: ProbeToAdopt, context: EndpointExtensionContext) => {
	const { services, database, getSchema } = context;
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const name = await getDefaultProbeName(userId, probe, context);

	const adoption: Omit<AdoptedProbe, 'id'> = {
		ip: probe.ip,
		altIps: probe.altIps,
		name,
		uuid: probe.uuid,
		version: probe.version,
		nodeVersion: probe.nodeVersion,
		hardwareDevice: probe.hardwareDevice,
		hardwareDeviceFirmware: probe.hardwareDeviceFirmware,
		systemTags: probe.systemTags,
		status: probe.status,
		city: probe.city,
		state: probe.state,
		stateName: probe.stateName,
		country: probe.country,
		countryName: probe.countryName,
		continent: probe.continent,
		continentName: probe.continentName,
		region: probe.region,
		latitude: probe.latitude,
		longitude: probe.longitude,
		asn: probe.asn,
		network: probe.network,
		userId,
		lastSyncDate: new Date(),
		isIPv4Supported: probe.isIPv4Supported,
		isIPv6Supported: probe.isIPv6Supported,
	};

	const existingProbe = await database('gp_probes')
		.where({ uuid: probe.uuid })
		.orWhere({ ip: probe.ip })
		.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ probe.ip ])
		.first<AdoptedProbe>();

	// Probe already assigned to the user.
	if (existingProbe && existingProbe.userId === adoption.userId) {
		return existingProbe;
	}

	// Probe exists but not assigned to the user (may be already assigned to another user).
	if (existingProbe) {
		const id = await itemsService.updateOne(existingProbe.id, {
			name: adoption.name,
			userId: adoption.userId,
			tags: '[]',
			customLocation: null,
		}, { emitEvents: false });

		await Promise.all([
			sendNotificationProbeAdopted({ ...adoption, id }, context),
			existingProbe.userId && existingProbe.userId !== userId && sendNotificationProbeUnassigned(existingProbe, context),
		]);

		return existingProbe;
	}

	// Probe not found by ip/uuid, trying to find user's offline probe by city/asn.
	const probeByAsn = await database('gp_probes')
		.orderByRaw(`gp_probes.lastSyncDate DESC, gp_probes.id DESC`)
		.where({
			userId: adoption.userId,
			status: 'offline',
			asn: adoption.asn,
			city: adoption.city,
		})
		.first<AdoptedProbe>();

	if (probeByAsn) {
		await itemsService.updateOne(probeByAsn.id, _.omit(adoption, 'name'), { emitEvents: false });
		return probeByAsn;
	}

	// Probe not exists.
	const id = await itemsService.createOne(adoption, { emitEvents: false });
	await sendNotificationProbeAdopted({ ...adoption, id }, context);
	const adoptedProbe = await itemsService.readOne(id);
	return adoptedProbe;
};

const findAdoptedProbes = async (filter: Record<string, unknown>, { services, getSchema, database }: EndpointExtensionContext) => {
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const probes = await itemsService.readByQuery({
		filter,
	}) as ProbeToAdopt[];

	return probes;
};

const getDefaultProbeName = async (userId: string, probe: ProbeToAdopt, context: EndpointExtensionContext) => {
	let name = null;
	const namePrefix = probe.country && probe.city ? `probe-${probe.country.toLowerCase().replaceAll(' ', '-')}-${probe.city.toLowerCase().replaceAll(' ', '-')}` : null;

	if (namePrefix) {
		const currentProbes = await findAdoptedProbes({
			userId,
			country: probe.country,
			city: probe.city,
		}, context);
		name = `${namePrefix}-${(currentProbes.length + 1).toString().padStart(2, '0')}`;
	}

	return name;
};

export const findAdoptedProbeByIp = async (ip: string, { database }: EndpointExtensionContext) => {
	const probe = await database('gp_probes').whereRaw(`
			(
				ip = ?
				OR JSON_CONTAINS(altIps, ?)
			)
			AND userId IS NOT NULL
	`, [ ip, `"${ip}"` ]).first();

	return probe;
};

const sendNotificationProbeAdopted = async (adoption: AdoptedProbe, { services, database, getSchema }: EndpointExtensionContext) => {
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await notificationsService.createOne({
		recipient: adoption.userId,
		subject: 'New probe adopted',
		message: `A new probe [**${adoption.name}**](/probes/${adoption.id}) with IP address **${adoption.ip}** has been assigned to your account.`,
	});
};

const sendNotificationProbeUnassigned = async (existingProbe: AdoptedProbe, { services, database, getSchema }: EndpointExtensionContext) => {
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await notificationsService.createOne({
		recipient: existingProbe.userId,
		subject: 'Probe unassigned',
		message: `Your probe ${existingProbe.name ? `**${existingProbe.name}** ` : ''}with IP address **${existingProbe.ip}** has been reassigned to another user (it reported an adoption token of another user).`,
	});
};
