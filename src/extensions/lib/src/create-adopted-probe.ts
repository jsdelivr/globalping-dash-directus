import type { EndpointExtensionContext } from '@directus/extensions';
import { getDefaultProbeName } from './default-probe-name.js';
import { getResetUserFields } from './reset-fields.js';

export type Override<Type, NewType> = Omit<Type, keyof NewType> & NewType;

export type ProbeToAdopt = {
	userId: string | null;
	ip: string;
	name: string | null;
	altIps: string[];
	uuid: string;
	tags: { value: string; prefix: string; format?: string }[];
	systemTags: string[];
	status: string;
	isIPv4Supported: boolean;
	isIPv6Supported: boolean;
	version: string;
	nodeVersion: string;
	hardwareDevice: string | null;
	hardwareDeviceFirmware: string | null;
	city: string;
	state: string | null;
	stateName: string | null;
	country: string;
	countryName: string;
	continent: string;
	continentName: string;
	region: string;
	latitude: number;
	longitude: number;
	asn: number;
	network: string;
	allowedCountries: string[];
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	customLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	localAdoptionServer: string | null;
};

export type Row = Override<ProbeToAdopt, {
	id: string;
	altIps: string;
	tags: string;
	systemTags: string;
	allowedCountries: string;
	isIPv4Supported: number;
	isIPv6Supported: number;
	originalLocation: string | null;
	customLocation: string | null;
	isOutdated: number;
	lastSyncDate: Date;
}>;

export type Probe = Override<Row, {
	altIps: string[];
	originalLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	customLocation: { country: string; city: string; latitude: number; longitude: number; state: string | null } | null;
	isOutdated: boolean;
	allowedCountries: string[];
	isIPv4Supported: boolean;
	isIPv6Supported: boolean;
	tags: { value: string; prefix: string; format?: string }[];
	systemTags: string[];
}>;

export const createAdoptedProbe = async (userId: string, probe: ProbeToAdopt, context: EndpointExtensionContext): Promise<Probe> => {
	const { services, database, getSchema } = context;
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema(),
	});

	let existingProbe: Probe | null = null;

	const row = await database('gp_probes')
		.where({ uuid: probe.uuid })
		.orWhere({ ip: probe.ip })
		.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ probe.ip ])
		.first<Row>();

	if (row) { existingProbe = parseRow(row); }

	// Latest metadata info comes from the API, so `probe` object is preffered over `existingProbe`.
	const metadata = {
		lastSyncDate: new Date(),
		ip: probe.ip,
		altIps: probe.altIps,
		uuid: probe.uuid,
		version: probe.version,
		nodeVersion: probe.nodeVersion,
		hardwareDevice: probe.hardwareDevice,
		hardwareDeviceFirmware: probe.hardwareDeviceFirmware,
		systemTags: probe.systemTags,
		status: probe.status,
		isIPv4Supported: probe.isIPv4Supported,
		isIPv6Supported: probe.isIPv6Supported,
		asn: probe.asn,
		network: probe.network,
		localAdoptionServer: probe.localAdoptionServer,
	};

	// Latest location info comes from SQL (e.g. probe with a custom location, not synced with the API yet), so `existingProbe` is preffered.
	const location = {
		allowedCountries: existingProbe?.allowedCountries || probe.allowedCountries,
		city: existingProbe?.city || probe.city,
		state: existingProbe?.state || probe.state,
		stateName: existingProbe?.stateName || probe.stateName,
		country: existingProbe?.country || probe.country,
		countryName: existingProbe?.countryName || probe.countryName,
		continent: existingProbe?.continent || probe.continent,
		continentName: existingProbe?.continentName || probe.continentName,
		region: existingProbe?.region || probe.region,
		latitude: existingProbe?.latitude || probe.latitude,
		longitude: existingProbe?.longitude || probe.longitude,
	};

	// Probe is already assigned to the user.
	if (existingProbe && existingProbe.userId === userId) {
		await itemsService.updateOne(existingProbe.id, metadata, { emitEvents: false });
		return await itemsService.readOne(existingProbe.id) as Probe;
	}

	// Probe exists but not assigned to the user (may be already assigned to another user).
	if (existingProbe) {
		const adoption: Override<ProbeToAdopt, { userId: string; name: string | null }> = {
			...metadata,
			...location,
			...getResetUserFields(existingProbe),
			userId,
		};
		adoption.name = await getDefaultProbeName(userId, adoption, context);

		await Promise.all([
			itemsService.updateOne(existingProbe.id, adoption, { emitEvents: false }),
			sendNotificationProbeAdopted({ ...adoption, id: existingProbe.id }, context),
			existingProbe.userId && existingProbe.userId !== userId && sendNotificationProbeUnassigned(existingProbe as Override<Probe, { userId: string }>, context),
		]);

		return await itemsService.readOne(existingProbe.id) as Probe;
	}

	// Probe not found by ip/uuid, trying to find user's offline probe by city/asn.
	const probeByAsn = await database('gp_probes')
		.orderByRaw(`gp_probes.lastSyncDate DESC, gp_probes.id DESC`)
		.where({
			userId,
			status: 'offline',
			asn: probe.asn,
			city: probe.city,
		})
		.first<Row>();

	if (probeByAsn) {
		await itemsService.updateOne(probeByAsn.id, {
			...metadata,
			...location,
			userId,
		}, { emitEvents: false });

		return await itemsService.readOne(probeByAsn.id) as Probe;
	}

	// Probe not exists.
	const name = await getDefaultProbeName(userId, location, context);
	const adoption = { ...metadata, ...location, userId, name };
	const id = await itemsService.createOne(adoption, { emitEvents: false }) as string;
	await sendNotificationProbeAdopted({ ...adoption, id }, context);
	return await itemsService.readOne(id) as Probe;
};

export const parseRow = (row: Row): Probe => ({
	...row,
	altIps: row.altIps ? JSON.parse(row.altIps) : [],
	originalLocation: row.originalLocation ? JSON.parse(row.originalLocation) : null,
	customLocation: row.customLocation ? JSON.parse(row.customLocation) : null,
	isOutdated: row.isOutdated ? Boolean(row.isOutdated) : false,
	allowedCountries: row.allowedCountries ? JSON.parse(row.allowedCountries) : [],
	isIPv4Supported: row.isIPv4Supported ? Boolean(row.isIPv4Supported) : false,
	isIPv6Supported: row.isIPv6Supported ? Boolean(row.isIPv6Supported) : false,
	tags: row.tags ? JSON.parse(row.tags) : [],
	systemTags: row.systemTags ? JSON.parse(row.systemTags) : [],
});

type NotificationInfo = {
	userId: string;
	name: string | null;
	id: string;
	ip: string;
};

const sendNotificationProbeAdopted = async (adoption: NotificationInfo, { services, getSchema }: EndpointExtensionContext) => {
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});

	await notificationsService.createOne({
		recipient: adoption.userId,
		subject: 'New probe adopted',
		message: `A new probe [**${adoption.name}**](/probes/${adoption.id}) with IP address **${adoption.ip}** has been assigned to your account.`,
	});
};

const sendNotificationProbeUnassigned = async (existingProbe: NotificationInfo, { services, getSchema }: EndpointExtensionContext) => {
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});

	await notificationsService.createOne({
		recipient: existingProbe.userId,
		subject: 'Probe unassigned',
		message: `Your probe ${existingProbe.name ? `**${existingProbe.name}** ` : ''}with IP address **${existingProbe.ip}** has been reassigned to another user (it reported an adoption token of another user).`,
	});
};
