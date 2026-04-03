import type { ApiExtensionContext } from '@directus/extensions';

type ProbeInfo = {
	id: string;
	ip: string;
	name: string | null;
	hardwareDevice: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
	isOutdated: boolean;
};

type Notification = {
	item: string | null;
	metadata: unknown;
};

export const OUTDATED_SOFTWARE_NOTIFICATION_TYPE = 'outdated_software';
export const OUTDATED_FIRMWARE_NOTIFICATION_TYPE = 'outdated_firmware';

export async function checkFirmwareVersions (probesToCheck: ProbeInfo[], userId: string, context: ApiExtensionContext): Promise<string[]> {
	const outdatedProbes = probesToCheck.filter(probe => probe.isOutdated);

	if (outdatedProbes.length === 0) { return []; }

	const alreadyNotifiedProbes = await getAlreadyNotifiedProbes(context, userId);
	const probes = outdatedProbes.filter(probe => !alreadyNotifiedProbes.has(probe.id));

	if (probes.length === 0) { return []; }

	const softwareProbes = probes.filter(probe => !probe.hardwareDevice);
	const hardwareProbes = probes.filter(probe => Boolean(probe.hardwareDevice));

	if (softwareProbes.length > 0 && hardwareProbes.length > 0) {
		return notifyMultipleTypes(softwareProbes, hardwareProbes, userId, context);
	}

	if (softwareProbes.length === 1) {
		const id = await notifySingleSoftwareProbe(softwareProbes[0]!, userId, context);
		return [ id ];
	}

	if (hardwareProbes.length === 1) {
		const id = await notifySingleHardwareProbe(hardwareProbes[0]!, userId, context);
		return [ id ];
	}

	if (softwareProbes.length > 1) {
		return notifyMultipleSoftwareProbes(softwareProbes, userId, context);
	}

	if (hardwareProbes.length > 1) {
		return notifyMultipleHardwareProbes(hardwareProbes, userId, context);
	}

	return [];
}

export const getAlreadyNotifiedProbes = async ({ env, services, getSchema }: ApiExtensionContext, userId?: string) => {
	const { ItemsService } = services;

	const notificationsService = new ItemsService<Notification>('directus_notifications', {
		schema: await getSchema(),
	});

	const existingNotifications = await notificationsService.readByQuery({
		fields: [ 'item', 'metadata' ],
		filter: {
			...userId ? { recipient: { _eq: userId } } : null,
			_or: [
				{
					type: { _eq: OUTDATED_SOFTWARE_NOTIFICATION_TYPE },
					secondary_type: { _eq: env.TARGET_NODE_VERSION },
				},
				{
					type: { _eq: OUTDATED_FIRMWARE_NOTIFICATION_TYPE },
					secondary_type: { _eq: `${env.TARGET_HW_DEVICE_FIRMWARE}_${env.TARGET_NODE_VERSION}` },
				},
			],
		},
	});

	const idsSet = new Set(existingNotifications.map(({ item }) => item).filter(id => id !== null));
	existingNotifications.filter(({ metadata }) => Array.isArray(metadata)).forEach(({ metadata }) => {
		(metadata as string[]).forEach((id) => { idsSet.add(id); });
	});

	return idsSet;
};

const notifySingleSoftwareProbe = async (probe: ProbeInfo, userId: string, { services, getSchema, env }: ApiExtensionContext) => {
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});

	await notificationsService.createOne({
		recipient: userId,
		item: probe.id,
		collection: 'gp_probes',
		type: OUTDATED_SOFTWARE_NOTIFICATION_TYPE,
		secondary_type: env.TARGET_NODE_VERSION,
		subject: 'Your probe container is running an outdated software',
		message: `Your ${probe.name ? `probe [${probe.name}](/probes/${probe.id}) with IP address **${probe.ip}**` : `[probe with IP address **${probe.ip}**](/probes/${probe.id})`} is running an outdated software and we couldn't update it automatically. Please follow [our guide](/probes?view=update-a-probe) to update it manually.`,
	});

	return probe.id;
};

const notifySingleHardwareProbe = async (probe: ProbeInfo, userId: string, { services, getSchema, env }: ApiExtensionContext) => {
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});

	await notificationsService.createOne({
		recipient: userId,
		item: probe.id,
		collection: 'gp_probes',
		type: OUTDATED_FIRMWARE_NOTIFICATION_TYPE,
		secondary_type: `${env.TARGET_HW_DEVICE_FIRMWARE}_${env.TARGET_NODE_VERSION}`,
		subject: 'Your hardware probe is running an outdated firmware',
		message: `Your ${probe.name ? `probe [${probe.name}](/probes/${probe.id}) with IP address **${probe.ip}**` : `[probe with IP address **${probe.ip}**](/probes/${probe.id})`} is running an outdated firmware and we couldn't update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.`,
	});

	return probe.id;
};

const notifyMultipleSoftwareProbes = async (probes: ProbeInfo[], userId: string, context: ApiExtensionContext) => {
	const { services, getSchema, env } = context;
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});
	const lines = probes.map(probe => `- ${probe.name ? `probe [${probe.name}](/probes/${probe.id})` : `[probe](/probes/${probe.id})`} with IP address **${probe.ip}**`);

	await notificationsService.createOne({
		recipient: userId,
		collection: 'gp_probes',
		metadata: probes.map(({ id }) => id),
		type: OUTDATED_SOFTWARE_NOTIFICATION_TYPE,
		secondary_type: env.TARGET_NODE_VERSION,
		subject: 'Probes with outdated software',
		message: `Some of your probes are running an outdated software and we couldn't update them automatically. Please follow [our guide](/probes?view=update-a-probe) to update them manually:\n${lines.join('\n')}`,
	});

	return probes.map(({ id }) => id);
};

const notifyMultipleHardwareProbes = async (probes: ProbeInfo[], userId: string, context: ApiExtensionContext) => {
	const { services, getSchema, env } = context;
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});
	const lines = probes.map(probe => `- ${probe.name ? `probe [${probe.name}](/probes/${probe.id})` : `[probe](/probes/${probe.id})`} with IP address **${probe.ip}**`);

	await notificationsService.createOne({
		recipient: userId,
		collection: 'gp_probes',
		metadata: probes.map(({ id }) => id),
		type: OUTDATED_FIRMWARE_NOTIFICATION_TYPE,
		secondary_type: `${env.TARGET_HW_DEVICE_FIRMWARE}_${env.TARGET_NODE_VERSION}`,
		subject: 'Probes with outdated firmware',
		message: `Some of your hardware probes are running an outdated firmware and we couldn't update them automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update them manually:\n${lines.join('\n')}`,
	});

	return probes.map(({ id }) => id);
};

const notifyMultipleTypes = async (softwareProbes: ProbeInfo[], hardwareProbes: ProbeInfo[], userId: string, context: ApiExtensionContext) => {
	const { services, getSchema, env } = context;
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});
	const softwareLines = softwareProbes.map(probe => `- ${probe.name ? `probe [${probe.name}](/probes/${probe.id})` : `[probe](/probes/${probe.id})`} with IP address **${probe.ip}**`);
	const hardwareLines = hardwareProbes.map(probe => `- ${probe.name ? `probe [${probe.name}](/probes/${probe.id})` : `[probe](/probes/${probe.id})`} with IP address **${probe.ip}**`);

	await notificationsService.createOne({
		recipient: userId,
		collection: 'gp_probes',
		metadata: [ ...softwareProbes.map(({ id }) => id), ...hardwareProbes.map(({ id }) => id) ],
		type: OUTDATED_SOFTWARE_NOTIFICATION_TYPE,
		secondary_type: env.TARGET_NODE_VERSION,
		subject: 'Probes with outdated software',
		message: `Some of your probes are outdated and we couldn't update them automatically. Please follow [our software update guide](/probes?view=update-a-probe) and [firmware update guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update them manually.\n\nOutdated software:\n${softwareLines.join('\n')}\n\nOutdated firmware:\n${hardwareLines.join('\n')}`,
	});

	return [ ...softwareProbes.map(({ id }) => id), ...hardwareProbes.map(({ id }) => id) ];
};
