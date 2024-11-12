import { test as baseTest, request } from '@playwright/test';
import { user, client as sql } from './client.ts';

const DIRECTUS_URL = 'http://localhost:18055';
let i = 0;

export * from '@playwright/test';
export const test = baseTest.extend({
	storageState: async ({}, use) => {
		// const fileName = path.resolve(test.info().project.outputDir, `.auth/${id}.json`);
		const fileName = 'test/e2e/user.json';

		console.log('i:', ++i);

		// Important: make sure we authenticate in a clean environment by unsetting storage state.
		const context = await request.newContext({ storageState: undefined });

		sql('directus_users').where({ id: user.id }).delete();
		const userRole = await sql('directus_roles').where({ name: 'User' }).select('id').first();
		await sql('directus_users').upsert({
			...user,
			role: userRole.id,
		});

		const loginResponse = await context.post(`${DIRECTUS_URL}/auth/login`, {
			data: {
				email: 'e2e@example.com',
				password: 'user',
				mode: 'session',
			},
		});

		if (!loginResponse.ok()) {
			throw new Error(`${loginResponse.status()} ${loginResponse.statusText()}`);
		}

		await context.storageState({ path: fileName });
		await use(fileName);
	},
});
