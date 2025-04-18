export async function up (knex) {
	const TABLE_NAME = 'gp_credits_additions';
	const creditAdditions = await knex(TABLE_NAME).select('*');

	for (const addition of creditAdditions) {
		let reason = '';
		let meta = {};

		if (addition.comment === undefined) {
			continue;
		}

		if (addition.comment.startsWith('One-time $')) {
			reason = 'one_time_sponsorship';
			const amountMatch = addition.comment.match(/\$(\d+)/);

			if (!amountMatch) {
				throw new Error(`Could not extract amount from comment: ${addition.comment}`);
			}

			meta = { amountInDollars: parseInt(amountMatch[1]) };
		} else if (addition.comment.startsWith('Recurring $')) {
			reason = 'recurring_sponsorship';
			const amountMatch = addition.comment.match(/\$(\d+)/);

			if (!amountMatch) {
				throw new Error(`Could not extract amount from comment: ${addition.comment}`);
			}

			meta = { amountInDollars: parseInt(amountMatch[1]) };
		} else if (addition.comment.startsWith('Adopted probe')) {
			reason = 'adopted_probe';
			const ipPartIndex = addition.comment.lastIndexOf(' (');
			const ipPart = addition.comment.slice(ipPartIndex);
			const ipMatch = ipPart.match(/\((.*?)\)\.$/);
			const ip = ipMatch[1];

			const namePart = addition.comment.slice(0, ipPartIndex);
			let name = namePart.replace('Adopted probe', '').trim();

			if (name.startsWith('"')) {
				name = name.slice(1);
			}

			if (name.endsWith('"')) {
				name = name.slice(0, -1);
			}

			meta = {
				id: addition.adopted_probe,
				name: name || null,
				ip,
			};
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
