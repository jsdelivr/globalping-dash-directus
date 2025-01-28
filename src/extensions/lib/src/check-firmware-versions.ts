import type { ApiExtensionContext } from '@directus/extensions';

type ProbeInfo = {
	id: string;
	ip: string;
	name: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
}

export const OUTDATED_FIRMWARE_NOTIFICATION_TYPE = 'outdated_firmware';

export const checkFirmwareVersions = async (probe: ProbeInfo, userId: string, context: ApiExtensionContext) => {
	const firmwareOutdated = isOutdated(probe.hardwareDeviceFirmware, context.env.TARGET_HW_DEVICE_FIRMWARE);
	const nodeOutdated = isOutdated(probe.nodeVersion, context.env.TARGET_NODE_VERSION);

	if (firmwareOutdated || nodeOutdated) {
		const id = await sendNotification(probe, userId, context);
		return id;
	}

	return null;
};

const isOutdated = (probeValue: string | null, metadataValue: string) => {
	if (!probeValue || !metadataValue) {
		return false;
	}

	const result = compareSemver(probeValue.replaceAll('v', ''), metadataValue.replaceAll('v', ''));
	return result === -1;
};

const compareSemver = (a: string, b: string) => {
	const pa = a.split('.');
	const pb = b.split('.');

	for (let i = 0; i < 3; i++) {
		const na = Number(pa[i]) || 0;
		const nb = Number(pb[i]) || 0;

		if (na > nb) { return 1; }

		if (nb > na) { return -1; }
	}

	return 0;
};

const sendNotification = async (probe: ProbeInfo, userId: string, { services, getSchema, database, env }: ApiExtensionContext) => {
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await notificationsService.createOne({
		recipient: userId,
		item: probe.id,
		collection: 'gp_adopted_probes',
		type: OUTDATED_FIRMWARE_NOTIFICATION_TYPE,
		secondary_type: `${env.TARGET_HW_DEVICE_FIRMWARE}_${env.TARGET_NODE_VERSION}`,
		subject: 'Your probe is running an outdated firmware',
		message: `Your ${probe.name ? `probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}**` : `[probe with IP address **${probe.ip}**](/probes/${probe.id})`} is running an outdated firmware and we couldn't update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.`,
	});

	return probe.id;
};
