import relativeDayUtc from 'relative-day-utc';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const seed = async (knex) => {
	const user = await knex('directus_users').where({ github_username: 'john' }).select('id').first();

	const [ readyProbes, offlineProbes, outdatedProbes ] = await Promise.all([
		knex('gp_probes').where({ userId: user.id, status: 'ready' }).select('id', 'name', 'ip').limit(7),
		knex('gp_probes').where({ userId: user.id, status: 'offline' }).select('id', 'name', 'ip', 'lastSyncDate').limit(10),
		knex('gp_probes').where({ userId: user.id, isOutdated: true }).select('id', 'name', 'ip', 'hardwareDeviceFirmware'),
	]);

	const isFirmwareOutdated = (probeValue, metadataValue) => {
		if (!probeValue || !metadataValue) {
			return false;
		}

		const probeParts = probeValue.replaceAll('v', '').split('.');
		const metadataParts = metadataValue.replaceAll('v', '').split('.');

		for (let i = 0; i < 3; i++) {
			const probePartNo = Number(probeParts[i]) || 0;
			const metadataPartNo = Number(metadataParts[i]) || 0;

			if (probePartNo > metadataPartNo) { return false; }

			if (metadataPartNo > probePartNo) { return true; }
		}

		return false;
	};

	const targetFirmware = process.env.TARGET_HW_DEVICE_FIRMWARE ?? 'v20.13.0';
	const targetNodeVersion = process.env.TARGET_NODE_VERSION ?? 'v2.0';

	// used to set status to archive on the last 40% of outdated probes
	const startArchiveIndex = Math.floor(outdatedProbes.length * 0.6);

	// for the unassigned notification
	const unassignedProbes = [
		{ name: 'london-probe-3', ip: '2.13.209.2' },
		{ name: 'Buenos Aires Probe 777', ip: '46.255.119.175' },
		{ name: 'frankfurt-probe-99', ip: '86.127.218.245' },
		{ name: 'seoul-probe-101', ip: '144.62.235.209' },
		{ name: 'Dublin Probe 12', ip: '9.7.23.158' },
	];

	// for the deleted notification
	const deletedProbes = [
		{ name: 'brussels-probe-10', ip: '181.23.72.25' },
		{ name: 'Prague Probe 13', ip: '201.166.208.21' },
		{ name: 'ouagadougou-probe-42', ip: '63.225.254.134' },
		{ name: 'antananarivo-probe-17', ip: '163.22.229.134' },
	];

	await knex('directus_notifications').insert([
		// welcome message
		{
			recipient: user.id,
			timestamp: relativeDayUtc(-10),
			status: 'inbox',
			subject: 'Welcome to Globalping!',
			message: 'As a registered user, you get 500 free tests per hour. Get more by hosting probes or sponsoring us and supporting the development of the project!',
		},
		// your probe has been reassigned message
		...unassignedProbes.map((probe, index) => (
			{
				recipient: user.id,
				timestamp: relativeDayUtc(-index),
				status: index % 2 ? 'archived' : 'inbox',
				subject: 'Probe unassigned',
				message: `Your probe ${probe.name} with IP address **${probe.ip}** has been reassigned to another user (it reported an adoption token of another user).`,
			}
		)),
		// your probe has been deleted message
		...deletedProbes.map((probe, index) => (
			{
				recipient: user.id,
				timestamp: relativeDayUtc(-index),
				status: index === 2 ? 'archived' : 'inbox',
				item: probe.id,
				collection: 'gp_probes',
				subject: 'Your probe has been deleted',
				message: `Your probe ${probe.name} with IP address **${probe.ip}** has been deleted from your account due to being offline for more than 30 days. You can adopt it again when it is back online.`,
			}
		)),
		// new probe adopted message
		...readyProbes.map((probe, index) => (
			{
				recipient: user.id,
				timestamp: relativeDayUtc(0),
				status: index === 3 ? 'archived' : 'inbox',
				subject: 'New probe adopted',
				message: `A new probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}** has been assigned to your account.`,
			}
		)),
		// your probe went offline message
		...offlineProbes.map((probe) => {
			const dateOfExpiration = new Date(probe.lastSyncDate);
			dateOfExpiration.setDate(dateOfExpiration.getDate() + 30);

			return {
				recipient: user.id,
				subject: 'Your probe went offline',
				timestamp: new Date(probe.lastSyncDate),
				type: 'offline_probe',
				item: probe.id,
				collection: 'gp_probes',
				message: `Your probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}** has been offline for more than 24 hours. If it does not come back online before **${dateOfExpiration.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}** it will be removed from your account.`,
			};
		}),
		// outdated software & firmware notifications
		...outdatedProbes.map((probe, index) => {
			if (isFirmwareOutdated(probe.hardwareDeviceFirmware, targetFirmware)) {
				return {
					recipient: user.id,
					timestamp: relativeDayUtc(0),
					status: index >= startArchiveIndex ? 'archived' : 'inbox',
					item: probe.id,
					collection: 'gp_probes',
					type: 'outdated_firmware',
					secondary_type: `${targetNodeVersion}_${targetFirmware}`,
					subject: 'Your hardware probe is running an outdated firmware',
					message: `Your probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}** is running an outdated firmware and we couldn't update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.`,
				};
			}

			return {
				recipient: user.id,
				timestamp: relativeDayUtc(0),
				status: index >= startArchiveIndex ? 'archived' : 'inbox',
				item: probe.id,
				collection: 'gp_probes',
				type: 'outdated_software',
				secondary_type: targetNodeVersion,
				subject: 'Your probe container is running an outdated software',
				message: `Your probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}** is running an outdated software and we couldn't update it automatically. Please follow [our guide](/probes?view=update-a-probe) to update it manually.`,
			};
		}),
	]);
};
