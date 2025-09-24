const TARGET_NODE_VERSION = process.env.TARGET_NODE_VERSION;
const TARGET_HW_DEVICE_FIRMWARE = process.env.TARGET_HW_DEVICE_FIRMWARE;

export const updateIsOutdatedColumn = async (knex) => {
	if (!TARGET_NODE_VERSION || !TARGET_HW_DEVICE_FIRMWARE) {
		throw new Error('TARGET_NODE_VERSION and TARGET_HW_DEVICE_FIRMWARE must be set');
	}

	await knex.raw(`DROP TRIGGER IF EXISTS gp_probes_isOutdated_insert`);
	await knex.raw(`DROP TRIGGER IF EXISTS gp_probes_isOutdated_update`);

	await knex.raw(`
		CREATE TRIGGER gp_probes_isOutdated_insert
		BEFORE INSERT ON gp_probes
		FOR EACH ROW
		SET NEW.isOutdated = ${getIsOutdatedLogic()}
	`);

	await knex.raw(`
		CREATE TRIGGER gp_probes_isOutdated_update
		BEFORE UPDATE ON gp_probes
		FOR EACH ROW
		SET NEW.isOutdated = ${getIsOutdatedLogic()}
	`);

	await knex.raw(`
		UPDATE gp_probes SET isOutdated = (
			${getIsOutdatedLogic().replace(/NEW\./g, '')}
		)
	`);
};

// isOutdated is true when:
// 1. nodeVersion is not null and it is less than TARGET_NODE_VERSION
// 2. hardwareDevice is not null and hardwareDeviceFirmware is null
// 3. hardwareDevice is not null and hardwareDeviceFirmware is less than TARGET_HW_DEVICE_FIRMWARE
// Versions are converted (e.g. v20.13.0 => 002000130000, v2.0 => 000200000000) then compared as strings.

const getIsOutdatedLogic = () => `
	CASE
		WHEN NEW.nodeVersion IS NOT NULL AND (${getVersionComparison('NEW.nodeVersion', TARGET_NODE_VERSION)}) THEN TRUE
		WHEN NEW.hardwareDevice IS NOT NULL AND NEW.hardwareDeviceFirmware IS NULL THEN TRUE
		WHEN NEW.hardwareDevice IS NOT NULL AND (${getVersionComparison('NEW.hardwareDeviceFirmware', TARGET_HW_DEVICE_FIRMWARE)}) THEN TRUE
		ELSE FALSE
	END
`;

const getVersionComparison = (probeField, targetVersion) => `
	CONCAT(
		LPAD(SUBSTRING_INDEX(REPLACE(${probeField}, 'v', ''), '.', 1), 4, '0'),
		LPAD(
			CASE
				WHEN LENGTH(REPLACE(${probeField}, 'v', '')) - LENGTH(REPLACE(REPLACE(${probeField}, 'v', ''), '.', '')) >= 1 THEN SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(${probeField}, 'v', ''), '.', 2), '.', -1)
				ELSE '0'
			END, 4, '0'),
		LPAD(
			CASE
				WHEN LENGTH(REPLACE(${probeField}, 'v', '')) - LENGTH(REPLACE(REPLACE(${probeField}, 'v', ''), '.', '')) >= 2 THEN SUBSTRING_INDEX(REPLACE(${probeField}, 'v', ''), '.', -1)
				ELSE '0'
			END, 4, '0')
	) < CONCAT(
		LPAD(SUBSTRING_INDEX(REPLACE('${targetVersion}', 'v', ''), '.', 1), 4, '0'),
		LPAD(
			CASE
				WHEN LENGTH(REPLACE('${targetVersion}', 'v', '')) - LENGTH(REPLACE(REPLACE('${targetVersion}', 'v', ''), '.', '')) >= 1 THEN SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE('${targetVersion}', 'v', ''), '.', 2), '.', -1)
				ELSE '0'
			END, 4, '0'),
		LPAD(
			CASE
				WHEN LENGTH(REPLACE('${targetVersion}', 'v', '')) - LENGTH(REPLACE(REPLACE('${targetVersion}', 'v', ''), '.', '')) >= 2 THEN SUBSTRING_INDEX(REPLACE('${targetVersion}', 'v', ''), '.', -1)
				ELSE '0'
			END, 4, '0')
	)
`;
