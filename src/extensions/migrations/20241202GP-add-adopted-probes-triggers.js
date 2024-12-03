export async function up (knex) {
	const PRIMARY_IP_IN_ALT_IPS_ERROR_CODE = 5001;
	const PRIMARY_IP_IN_ANOTHER_PROBE_ALT_IPS_ERROR_CODE = 5002;
	const ALT_IP_IS_ANOTHER_PROBE_PRIMARY_IP_ERROR_CODE = 5003;
	const ALT_IP_IN_ANOTHER_PROBE_ALT_IPS_ERROR_CODE = 5004;

	// CHECK PRIMARY IP IN ALT IPS
	await knex.raw(`
		CREATE PROCEDURE check_ip_conflicts(IN new_id char(36), IN new_ip VARCHAR(255), new_altIps LONGTEXT)
		BEGIN
		    DECLARE message VARCHAR(255);

				-- Check if the primary IP exists in the alt IPs of current row.
				IF JSON_CONTAINS(new_altIps, JSON_QUOTE(new_ip)) THEN
						SET message = CONCAT('Specified primary IP ', new_ip, ' is also specified in the alt IPs. Operation not allowed.');
						SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = ${PRIMARY_IP_IN_ALT_IPS_ERROR_CODE}, MESSAGE_TEXT = message;
				END IF;

				-- Check if the primary IP exists in the alt IPs of any other row.
				IF EXISTS (
						SELECT 1
						FROM gp_adopted_probes
						WHERE JSON_CONTAINS(altIps, JSON_QUOTE(new_ip)) AND id != new_id
				) THEN
						SET message = CONCAT('Specified primary IP ', new_ip, ' already exists in the alt IPs of another row. Operation not allowed.');
						SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = ${PRIMARY_IP_IN_ANOTHER_PROBE_ALT_IPS_ERROR_CODE}, MESSAGE_TEXT = message;
				END IF;
		END;
	`);

	await knex.raw(`
		CREATE TRIGGER before_gp_adopted_probes_ip_update
		BEFORE UPDATE ON gp_adopted_probes
		FOR EACH ROW
		BEGIN
				CALL check_ip_conflicts(NEW.id, NEW.ip, NEW.altIps);
		END;
	`);

	await knex.raw(`
		CREATE TRIGGER before_gp_adopted_probes_ip_insert
		BEFORE INSERT ON gp_adopted_probes
		FOR EACH ROW
		BEGIN
				CALL check_ip_conflicts(NEW.id, NEW.ip, NEW.altIps);
		END;
	`);

	// CHECK ALT IP IN ALT IPS
	await knex.raw(`
		CREATE PROCEDURE check_alt_ips_conflicts(IN new_id char(36), new_altIps LONGTEXT)
		BEGIN
				DECLARE current_altIp VARCHAR(255);
				DECLARE i INT DEFAULT 0;
				DECLARE message VARCHAR(255);
				DECLARE existing_altIps LONGTEXT;
				DECLARE existing_ip VARCHAR(255);

				WHILE i < JSON_LENGTH(new_altIps) DO
						SET current_altIp = JSON_UNQUOTE(JSON_EXTRACT(new_altIps, CONCAT('$[', i, ']')));

						SELECT altIps, ip INTO existing_altIps, existing_ip
						FROM gp_adopted_probes
						WHERE (
								JSON_CONTAINS(altIps, JSON_QUOTE(current_altIp))
								OR ip = current_altIp
						)
						AND id != new_id
						LIMIT 1;

						IF existing_ip = current_altIp THEN
								SET message = CONCAT('Alt IP ', current_altIp, ' is already an IP of another row. Operation not allowed.');
								SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = ${ALT_IP_IS_ANOTHER_PROBE_PRIMARY_IP_ERROR_CODE}, MESSAGE_TEXT = message;
						ELSEIF JSON_CONTAINS(existing_altIps, JSON_QUOTE(current_altIp)) THEN
								SET message = CONCAT('Alt IP ', current_altIp, ' is already exists in the altIps of another row. Operation not allowed.');
								SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = ${ALT_IP_IN_ANOTHER_PROBE_ALT_IPS_ERROR_CODE}, MESSAGE_TEXT = message;
						END IF;

						SET i = i + 1;
				END WHILE;
		END;
	`);

	await knex.raw(`
		CREATE TRIGGER before_gp_adopted_probes_alt_ips_update
		BEFORE UPDATE ON gp_adopted_probes
		FOR EACH ROW
		BEGIN
				CALL check_alt_ips_conflicts(NEW.id, NEW.altIps);
		END;
	`);

	await knex.raw(`
		CREATE TRIGGER before_gp_adopted_probes_alt_ips_insert
		BEFORE INSERT ON gp_adopted_probes
		FOR EACH ROW
		BEGIN
				CALL check_alt_ips_conflicts(NEW.id, NEW.altIps);
		END;
	`);

	console.log('Triggers for gp_adopted_probes created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
