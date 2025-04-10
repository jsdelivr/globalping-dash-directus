import { randomUUID } from 'node:crypto';

export async function up (knex) {
	const columnsInfo = await knex('gp_probes').columnInfo();

	if (columnsInfo?.id?.type === 'char') {
		console.log('Probe ids are already UUIDs');
		return;
	}

	// Remove relation
	await knex.schema.alterTable('gp_credits_additions', (table) => {
		table.dropForeign('adopted_probe', 'gp_credits_additions_adopted_probe_foreign');
	});

	// Update primary col type
	await knex.raw(`ALTER TABLE gp_probes MODIFY id char(36) not null;`);

	// Update reference col type
	await knex.raw(`ALTER TABLE gp_credits_additions MODIFY adopted_probe char(36);`);

	// Update columns to new values
	await knex.transaction(async (trx) => {
		const result = await trx('gp_probes').select('id');
		const prevIdToNewId = {};

		for (const { id: prevId } of result) {
			prevIdToNewId[prevId] = randomUUID();
		}

		for (const [ prevId, newId ] of Object.entries(prevIdToNewId)) {
			await trx('gp_probes').where({ id: prevId }).update({ id: newId });
			await trx('gp_credits_additions').where({ adopted_probe: prevId }).update({ adopted_probe: newId });
		}
	});

	// Get relation back
	await knex.schema.alterTable('gp_credits_additions', (table) => {
		table.foreign('adopted_probe', 'gp_credits_additions_adopted_probe_foreign')
			.references('id')
			.inTable('gp_probes')
			.onDelete('SET NULL');
	});

	console.log('Probe ids moved from number to UUID');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
