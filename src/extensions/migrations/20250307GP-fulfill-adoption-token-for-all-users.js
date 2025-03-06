import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { base32 } from '@scure/base';

const getRandomBytes = promisify(randomBytes);

export async function up (knex) {
	const usersWithoutToken = await knex('directus_users').select().where({ adoption_token: '' });

	const updatedUsers = await Promise.all(usersWithoutToken.map(async (user) => {
		const bytes = await getRandomBytes(20);
		const byteString = base32.encode(bytes).toLowerCase();
		return { ...user, adoption_token: byteString };
	}));

	for (const user of updatedUsers) {
		await knex('directus_users').where({ id: user.id }).update({ adoption_token: user.adoption_token });
	}

	console.log('Added adoption token to every user.');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
