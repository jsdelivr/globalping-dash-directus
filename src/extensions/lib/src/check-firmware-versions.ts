import type { ApiExtensionContext } from '@directus/extensions';

type ProbeInfo = {
	id: string;
	ip: string;
	name: string | null;
	hardwareDeviceFirmware: string | null;
	nodeVersion: string | null;
}

export const getFirmwareSubject = (version: string) => `Outdated probe firmware, should be ${version}`;
export const getNodeVersionSubject = (version: string) => `Outdated probe node.js version, should be ${version}`;

export const checkFirmwareVersions = async (probe: ProbeInfo, userId: string, context: ApiExtensionContext, { checkFirmware = true, checkNode = true } = {}) => {
	const firmwareOutdated = checkFirmware && isOutdated(probe.hardwareDeviceFirmware, context.env.TARGET_HW_DEVICE_FIRMWARE);
	const nodeOutdated = checkNode && isOutdated(probe.nodeVersion, context.env.TARGET_NODE_VERSION);

	if (firmwareOutdated || nodeOutdated) {
		const subject = firmwareOutdated ? getFirmwareSubject(context.env.TARGET_HW_DEVICE_FIRMWARE) : getNodeVersionSubject(context.env.TARGET_NODE_VERSION);
		const id = await sendNotification(probe, userId, subject, context);
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

export const sendNotification = async (probe: ProbeInfo, userId: string, subject: string, { services, getSchema, database }: ApiExtensionContext) => {
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await notificationsService.createOne({
		recipient: userId,
		subject,
		message: `Your ${probe.name ? `probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}**` : `[probe with IP address **${probe.ip}**](/probes/${probe.id})`} is running an outdated firmware and we couldn't update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.`,
		item: probe.id,
		collection: 'gp_adopted_probes',
	});

	return probe.id;
};
