const TARGET_NODE_VERSION = process.env.TARGET_NODE_VERSION;
const TARGET_HW_DEVICE_FIRMWARE = process.env.TARGET_HW_DEVICE_FIRMWARE;

export const updateIsOutdatedColumn = async (knex) => {
	if (!TARGET_NODE_VERSION || !TARGET_HW_DEVICE_FIRMWARE) {
		throw new Error('TARGET_NODE_VERSION and TARGET_HW_DEVICE_FIRMWARE must be set');
	}

	await knex.raw(`
		ALTER TABLE gp_probes DROP COLUMN IF EXISTS isOutdated;
	`);

	// isOutdated is true when:
	// 1. nodeVersion is not null and it is less than TARGET_NODE_VERSION
	// 2. hardwareDevice is not null and hardwareDeviceFirmware is null
	// 3. hardwareDevice is not null and hardwareDeviceFirmware is less than TARGET_HW_DEVICE_FIRMWARE
	// Versions are converted (e.g. v20.13.0 => 002000130000, v2.0 => 000200000000) then compared as strings.
	await knex.raw(`
		ALTER TABLE gp_probes ADD COLUMN isOutdated BOOLEAN GENERATED ALWAYS AS (
			CASE
				WHEN nodeVersion IS NOT NULL AND (
					CONCAT(
						LPAD(SUBSTRING_INDEX(REPLACE(nodeVersion, 'v', ''), '.', 1), 4, '0'),
						LPAD(
							-- If minor version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE(nodeVersion, 'v', '')) - LENGTH(REPLACE(REPLACE(nodeVersion, 'v', ''), '.', '')) >= 1 THEN SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(nodeVersion, 'v', ''), '.', 2), '.', -1)
								ELSE '0'
							END, 4, '0'),
						LPAD(
							-- If patch version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE(nodeVersion, 'v', '')) - LENGTH(REPLACE(REPLACE(nodeVersion, 'v', ''), '.', '')) >= 2 THEN SUBSTRING_INDEX(REPLACE(nodeVersion, 'v', ''), '.', -1)
								ELSE '0'
							END, 4, '0')
					) < CONCAT(
						LPAD(SUBSTRING_INDEX(REPLACE('${TARGET_NODE_VERSION}', 'v', ''), '.', 1), 4, '0'),
						LPAD(
							-- If minor version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE('${TARGET_NODE_VERSION}', 'v', '')) - LENGTH(REPLACE(REPLACE('${TARGET_NODE_VERSION}', 'v', ''), '.', '')) >= 1 THEN SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE('${TARGET_NODE_VERSION}', 'v', ''), '.', 2), '.', -1)
								ELSE '0'
							END, 4, '0'),
						LPAD(
							-- If patch version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE('${TARGET_NODE_VERSION}', 'v', '')) - LENGTH(REPLACE(REPLACE('${TARGET_NODE_VERSION}', 'v', ''), '.', '')) >= 2 THEN SUBSTRING_INDEX(REPLACE('${TARGET_NODE_VERSION}', 'v', ''), '.', -1)
								ELSE '0'
							END, 4, '0')
					)
				) THEN TRUE
				WHEN hardwareDevice IS NOT NULL AND hardwareDeviceFirmware IS NULL THEN TRUE
				WHEN hardwareDevice IS NOT NULL AND (
					CONCAT(
						LPAD(SUBSTRING_INDEX(REPLACE(hardwareDeviceFirmware, 'v', ''), '.', 1), 4, '0'),
						LPAD(
							-- If minor version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE(hardwareDeviceFirmware, 'v', '')) - LENGTH(REPLACE(REPLACE(hardwareDeviceFirmware, 'v', ''), '.', '')) >= 1 THEN SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(hardwareDeviceFirmware, 'v', ''), '.', 2), '.', -1)
								ELSE '0'
							END, 4, '0'),
						LPAD(
							-- If patch version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE(hardwareDeviceFirmware, 'v', '')) - LENGTH(REPLACE(REPLACE(hardwareDeviceFirmware, 'v', ''), '.', '')) >= 2 THEN SUBSTRING_INDEX(REPLACE(hardwareDeviceFirmware, 'v', ''), '.', -1)
								ELSE '0'
							END, 4, '0')
					) < CONCAT(
						LPAD(SUBSTRING_INDEX(REPLACE('${TARGET_HW_DEVICE_FIRMWARE}', 'v', ''), '.', 1), 4, '0'),
						LPAD(
							-- If minor version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE('${TARGET_HW_DEVICE_FIRMWARE}', 'v', '')) - LENGTH(REPLACE(REPLACE('${TARGET_HW_DEVICE_FIRMWARE}', 'v', ''), '.', '')) >= 1 THEN SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE('${TARGET_HW_DEVICE_FIRMWARE}', 'v', ''), '.', 2), '.', -1)
								ELSE '0'
							END, 4, '0'),
						LPAD(
							-- If patch version is missing treat it as 0.
							CASE
								WHEN LENGTH(REPLACE('${TARGET_HW_DEVICE_FIRMWARE}', 'v', '')) - LENGTH(REPLACE(REPLACE('${TARGET_HW_DEVICE_FIRMWARE}', 'v', ''), '.', '')) >= 2 THEN SUBSTRING_INDEX(REPLACE('${TARGET_HW_DEVICE_FIRMWARE}', 'v', ''), '.', -1)
								ELSE '0'
							END, 4, '0')
					)
				) THEN TRUE
				ELSE FALSE
			END
		) STORED;
	`);
};
