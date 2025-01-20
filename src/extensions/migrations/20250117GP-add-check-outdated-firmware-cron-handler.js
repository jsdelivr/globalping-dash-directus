import { randomUUID } from 'node:crypto';
import { createFlow, createOperation, assignOperationToFlow } from '../migration-utils.js';

export async function up () {
	const flowId = randomUUID();

	await createFlow(flowId, {
		name: 'Outdated Firmware CRON',
		description: 'Sends notification to probes with outdated firmware',
		trigger: 'schedule',
		options: {
			cron: '1 0 * * *',
		},
	});

	const operation = await createOperation(flowId, {
		name: 'Check outdated firmware CRON handler',
		key: 'check_outdated_firmware_cron_handler',
		type: 'check-outdated-firmware-cron-handler',
	});

	await assignOperationToFlow(flowId, operation.id);
	console.log('Outdated firmware CRON handler added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
