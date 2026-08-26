import type { EndpointExtensionContext } from '@directus/extensions';
import { getAccountOwnerFields } from './accounts.js';
import { escapeMdSymbols, getDefaultProbeName } from './probe-name.js';
import { sendNotification } from './send-notification.js';
import { getResetUserFields } from './reset-fields.js';

export type Override<Type, NewType> = Omit<Type, keyof NewType> & NewType;

export type ProbeToAdopt = {
	userId: string | null;
	account_id: string | null;
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

export type AdoptedProbe = Override<Probe, { account_id: string }>;

export const createAdoptedProbe = async (accountId: string, probe: ProbeToAdopt, context: EndpointExtensionContext): Promise<AdoptedProbe> => {
	const { services, database, getSchema } = context;
	const itemsService = new services.ItemsService('gp_probes', {
		schema: await getSchema(),
	});

	// PHASE5: drop `userId` from the owner fields - the account alone defines the owner.
	const owner = await getAccountOwnerFields(accountId, context);
	let existingProbe: Probe | null = null;

	const row = await database('gp_probes')
		.where({ uuid: probe.uuid })
		.orWhere({ ip: probe.ip })
		.orWhereRaw('JSON_CONTAINS(altIps, ?)', [ probe.ip ])
		.first<Row>();

	if (row) { existingProbe = parseRow(row); }

	// Latest metadata info comes from the API, so `probe` object is preferred over `existingProbe`.
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

	// Latest location info comes from SQL (e.g. probe with a custom location, not synced with the API yet), so `existingProbe` is preferred.
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

	// Probe is already assigned to the account.
	if (existingProbe && existingProbe.account_id === accountId) {
		await itemsService.updateOne(existingProbe.id, metadata, { emitEvents: false });
		return await itemsService.readOne(existingProbe.id) as AdoptedProbe;
	}

	// Probe exists but not assigned to the account (may be already assigned to another account).
	if (existingProbe) {
		const adoption: Override<ProbeToAdopt, { account_id: string; name: string | null }> = {
			...metadata,
			...location,
			...getResetUserFields(existingProbe),
			...owner,
		};
		adoption.name = await getDefaultProbeName(accountId, adoption, context);

		await Promise.all([
			itemsService.updateOne(existingProbe.id, adoption, { emitEvents: false }),
			sendNotificationProbeAdopted({ ...adoption, id: existingProbe.id }, context),
			existingProbe.account_id && existingProbe.account_id !== accountId && sendNotificationProbeUnassigned(existingProbe as AdoptedProbe, context),
		]);

		return await itemsService.readOne(existingProbe.id) as AdoptedProbe;
	}

	// Probe not found by ip/uuid, trying to find the account's offline probe by city/asn.
	const probeByAsn = await database('gp_probes')
		.orderByRaw(`gp_probes.lastSyncDate DESC, gp_probes.id DESC`)
		.where({
			account_id: accountId,
			status: 'offline',
			asn: probe.asn,
			city: probe.city,
		})
		.first<Row>();

	if (probeByAsn) {
		await itemsService.updateOne(probeByAsn.id, {
			...metadata,
			...location,
			...owner,
		}, { emitEvents: false });

		return await itemsService.readOne(probeByAsn.id) as AdoptedProbe;
	}

	// Probe not exists.
	const name = await getDefaultProbeName(accountId, location, context);
	const adoption = { ...metadata, ...location, ...owner, name };
	const id = await itemsService.createOne(adoption, { emitEvents: false }) as string;
	await sendNotificationProbeAdopted({ ...adoption, id }, context);
	return await itemsService.readOne(id) as AdoptedProbe;
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
	account_id: string;
	name: string | null;
	id: string;
	ip: string;
};

const sendNotificationProbeAdopted = async (adoption: NotificationInfo, context: EndpointExtensionContext) => {
	await sendNotification({
		account: adoption.account_id,
		type: 'probe_adopted',
		subject: 'New probe adopted',
		message: `A new ${adoption.name ? `probe [${escapeMdSymbols(adoption.name)}](/probes/${adoption.id})` : `[probe](/probes/${adoption.id})`} with IP address **${adoption.ip}** has been assigned to your account.`,
	}, context);
};

const sendNotificationProbeUnassigned = async (existingProbe: NotificationInfo, context: EndpointExtensionContext) => {
	await sendNotification({
		account: existingProbe.account_id,
		type: 'probe_unassigned',
		subject: 'Probe unassigned',
		message: `Your probe ${existingProbe.name ? `**${escapeMdSymbols(existingProbe.name)}** ` : ''}with IP address **${existingProbe.ip}** has been reassigned to another user because it reported an adoption token that belongs to another user.`,
	}, context);
};
