import { randomUUID } from 'node:crypto';
import { createFlow, createOperation, assignOperationToFlow } from '../migration-utils/flows.js';

export async function up () {
	const flowId = randomUUID();

	await createFlow(flowId, {
		name: 'Org members CRON',
		description: 'Verifies org memberships against GitHub and removes the ones that are gone',
		trigger: 'schedule',
		options: {
			cron: '0 2 * * *',
		},
	});

	const operation = await createOperation(flowId, {
		name: 'Check org members CRON handler',
		key: 'check_members_cron_handler',
		type: 'check-members-cron-handler',
	});

	await assignOperationToFlow(flowId, operation.id);
	console.log('Org members CRON handler added');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
