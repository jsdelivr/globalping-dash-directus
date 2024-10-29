import { randomUUID } from 'node:crypto';
import { createFlow, createOperation, assignOperationToFlow } from '../migration-utils.js';

export async function up () {
	const flowId = randomUUID(); // Flow id needs to be a uuid, as Directus throws otherwise. This is a random value.

	await createFlow(flowId, {
		name: 'Expired probes CRON',
		description: 'Removes expired probe adoptions from directus',
		trigger: 'schedule',
		options: {
			cron: '0 0 * * *',
		},
	});

	const operation = await createOperation(flowId, {
		name: 'Remove expired adoptions CRON handler',
		key: 'remove_expired_adoptions_cron_handler',
		type: 'remove-expired-adoptions-cron-handler',
	});

	await assignOperationToFlow(flowId, operation.id);
	console.log('Expired probes CRON handler added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
