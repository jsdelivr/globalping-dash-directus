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

export const OUTDATED_SOFTWARE_NOTIFICATION_TYPE = 'outdated_software';
export const OUTDATED_FIRMWARE_NOTIFICATION_TYPE = 'outdated_firmware';

export async function checkFirmwareVersions (probes: ProbeInfo[], userId: string, context: ApiExtensionContext): Promise<string[]> {
	const outdatedProbes = probes.filter(probe => probe.isOutdated);

	if (outdatedProbes.length === 0) {
		return [];
	}

	const softwareProbes = outdatedProbes.filter(probe => !probe.hardwareDevice);
	const hardwareProbes = outdatedProbes.filter(probe => Boolean(probe.hardwareDevice));

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
		return notifyMultipleSoftwareProbe(softwareProbes, userId, context);
	}

	if (hardwareProbes.length > 1) {
		return notifyMultipleHardwareProbe(hardwareProbes, userId, context);
	}

	return [];
}

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

const notifyMultipleSoftwareProbe = async (probes: ProbeInfo[], userId: string, context: ApiExtensionContext) => {
	const { services, getSchema, env } = context;
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});
	const lines = probes.map(probe => `- ${probe.name ? `probe [${probe.name}](/probes/${probe.id})` : `[probe](/probes/${probe.id})`} with IP address **${probe.ip}**`);

	await notificationsService.createOne({
		recipient: userId,
		collection: 'gp_probes',
		type: OUTDATED_SOFTWARE_NOTIFICATION_TYPE,
		secondary_type: env.TARGET_NODE_VERSION,
		subject: 'Probes with outdated software',
		message: `Some of your probes are running an outdated software:\n${lines.join('\n')}\n\nPlease follow [our guide](/probes?view=update-a-probe) to update them manually.`,
	});

	return probes.map(({ id }) => id);
};

const notifyMultipleHardwareProbe = async (probes: ProbeInfo[], userId: string, context: ApiExtensionContext) => {
	const { services, getSchema, env } = context;
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});
	const lines = probes.map(probe => `- ${probe.name ? `probe [${probe.name}](/probes/${probe.id})` : `[probe](/probes/${probe.id})`} with IP address **${probe.ip}**`);

	await notificationsService.createOne({
		recipient: userId,
		collection: 'gp_probes',
		type: OUTDATED_FIRMWARE_NOTIFICATION_TYPE,
		secondary_type: `${env.TARGET_HW_DEVICE_FIRMWARE}_${env.TARGET_NODE_VERSION}`,
		subject: 'Probes with outdated firmware',
		message: `Some of your hardware probes are running an outdated firmware:\n${lines.join('\n')}\n\nPlease follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update them manually.`,
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
		type: OUTDATED_SOFTWARE_NOTIFICATION_TYPE,
		secondary_type: env.TARGET_NODE_VERSION,
		subject: 'Probes with outdated firmware',
		message: `Some of your probes are outdated:\n\nOutdated software:\n${softwareLines.join('\n')}\n\nOutdated firmware:\n${hardwareLines.join('\n')}\n\nPlease follow [our software update guide](/probes?view=update-a-probe) and [firmware update guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware).`,
	});

	return [ ...softwareProbes.map(({ id }) => id), ...hardwareProbes.map(({ id }) => id) ];
};
