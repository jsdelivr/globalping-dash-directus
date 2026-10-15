import { randomUUID } from 'node:crypto';
import relativeDayUtc from 'relative-day-utc';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const seed = async (knex) => {
	const admin = await knex('directus_users').where({ email: 'admin@example.com' }).select('id').first();
	const userRole = await knex('directus_roles').where({ name: 'User' }).select('id').first();
	const recipients = [
		{ id: '098e62ab-64ae-4cfb-829b-9e429e7a9e01', githubId: '9100000001', login: 'test-manual-additions-production' },
		{ id: '098e62ab-64ae-4cfb-829b-9e429e7a9e02', githubId: '9100000002', login: 'test-manual-additions-staging' },
		{ githubId: '9100000003', login: 'test-unlinked-recipient-long-name' },
		{ githubId: '9100000004', login: 'test-pagination-recipient' },
	];

	await knex.transaction(async (trx) => {
		for (const recipient of recipients.filter(recipient => recipient.id)) {
			await trx('directus_users').insert({
				id: recipient.id,
				first_name: 'Manual',
				last_name: 'Additions',
				role: userRole.id,
				provider: 'default',
				external_identifier: recipient.githubId,
				github_username: recipient.login,
				github_organizations: '[]',
				email_notifications: 0,
				adoption_token: randomUUID(),
				default_prefix: recipient.login,
			}).onConflict('id').merge([ 'github_username', 'default_prefix' ]);
		}

		// Replace only these examples when rerunning this seed on an existing local database.
		const userIds = recipients.filter(recipient => recipient.id).map(recipient => recipient.id);
		await trx('gp_credits_deductions').whereIn('user_id', userIds).delete();
		await trx('gp_credits').whereIn('user_id', userIds).delete();
		await trx('gp_credits_additions').whereIn('github_id', recipients.map(recipient => recipient.githubId)).delete();

		await trx('gp_credits_additions').insert(Array.from({ length: 24 }, (_, index) => {
			const recipient = recipients[index % recipients.length];
			const payment = index % recipients.length === 2;
			const amounts = [ 12_345_678_901, 98_765_432_109, 3_456_789_012, 1_234_567 ];
			const comments = [
				'Synthetic credit adjustment.',
				'Synthetic staging adjustment with a long comment to verify that manual-addition details remain readable when the modal is displayed on a small screen.',
				'',
				'Synthetic pagination example.',
			];

			return {
				github_id: recipient.githubId,
				amount: amounts[index % amounts.length],
				reason: payment ? 'one_time_sponsorship' : 'other',
				meta: JSON.stringify({
					manual: true,
					githubLogin: recipient.login,
					...payment ? { amountInDollars: 123.45 } : { comment: comments[index % comments.length] },
				}),
				consumed: 1,
				date_created: relativeDayUtc(-40 - index),
				user_updated: index % 5 === 4 ? null : admin.id,
			};
		}));
	});
};
