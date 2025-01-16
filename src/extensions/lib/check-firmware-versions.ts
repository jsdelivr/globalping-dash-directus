import type { ApiExtensionContext } from '@directus/extensions';

type ProbeInfo = {
	id: string;
	ip: string;
	name: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
}

const NOTIFICATION_SUBJECT = 'Probe firmware outdated';

export const checkFirmwareVersions = async (probe: ProbeInfo, userId: string, context: ApiExtensionContext) => {
	const firmwareOutdated = isOutdated(probe.hardwareDeviceFirmware, context.env.TARGET_HW_DEVICE_FIRMWARE);
	const nodeOutdated = isOutdated(probe.nodeVersion, context.env.TARGET_NODE_VERSION);

	if (firmwareOutdated || nodeOutdated) {
		await sendNotification(probe, userId, context);
	}
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

export const sendNotification = async (probe: ProbeInfo, userId: string, { services, getSchema, database }: ApiExtensionContext) => {
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await notificationsService.createOne({
		recipient: userId,
		subject: NOTIFICATION_SUBJECT,
		message: `Your ${probe.name ? `probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}**` : `[probe with IP address **${probe.ip}**](/probes/${probe.id})`} has outdated firmware and we couldn't update it automatically. Please update it manually using the guide from [GitHub](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware).`,
		item: probe.id,
		collection: 'gp_adopted_probes',
	});

	return probe.id;
};
