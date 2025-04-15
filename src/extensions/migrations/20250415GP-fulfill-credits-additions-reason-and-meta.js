export async function up (knex) {
	const TABLE_NAME = 'gp_credits_additions';
	const creditAdditions = await knex(TABLE_NAME).select('*');

	for (const addition of creditAdditions) {
		let reason = '';
		let meta = {};

		if (addition.comment.includes('One-time $')) {
			reason = 'one_time_sponsorship';
			const amountMatch = addition.comment.match(/\$(\d+)/);

			if (!amountMatch) {
				throw new Error(`Could not extract amount from comment: ${addition.comment}`);
			}

			meta = { amountInDollars: parseInt(amountMatch[1]) };
		} else if (addition.comment.includes('Recurring $')) {
			reason = 'recurring_sponsorship';
			const amountMatch = addition.comment.match(/\$(\d+)/);

			if (!amountMatch) {
				throw new Error(`Could not extract amount from comment: ${addition.comment}`);
			}

			meta = { amountInDollars: parseInt(amountMatch[1]) };
		} else if (addition.comment.includes('Adopted probe')) {
			reason = 'adopted_probe';
			const ipMatch = addition.comment.match(/\((.*?)\)\.$/);
			const nameMatch = addition.comment.match(/Adopted probe "(.*?)" \(/);

			if (ipMatch && addition.adopted_probe) {
				meta = {
					id: addition.adopted_probe,
					name: nameMatch ? nameMatch[1] : null,
					ip: ipMatch[1],
				};
			}
		} else {
			reason = 'other';
			meta = { comment: addition.comment };
		}

		await knex(TABLE_NAME)
			.where('id', addition.id)
			.update({
				reason,
				meta: JSON.stringify(meta),
			});
	}

	console.log('Successfully updated gp_credits_additions with reason and meta fields');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
