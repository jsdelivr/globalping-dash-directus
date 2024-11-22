import { test as baseTest, request } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { client as sql } from './client.ts';
import { clearUserData, generateUser } from './utils.ts';
import { User } from './types.ts';

export * from '@playwright/test';
export const test = baseTest.extend<{ user: User }>({
	user: async ({}, use) => {
		const user = await generateUser();
		use(user);
	},
	storageState: async ({ user }, use) => {
		await sql('directus_users').insert(user);

		// Make sure we authenticate in a clean environment by unsetting storage state.
		const context = await request.newContext({ storageState: undefined });
		// Log in the user.
		const loginResponse = await context.post(`${process.env.DIRECTUS_URL}/auth/login`, {
			data: {
				email: user.email,
				password: 'user',
				mode: 'session',
			},
		});

		if (!loginResponse.ok()) {
			throw new Error(`${loginResponse.status()} ${loginResponse.statusText()}`);
		}

		const fileName = path.resolve(test.info().project.outputDir, `.auth/${user.id}.json`);
		// Save auth in a file.
		await context.storageState({ path: fileName });

		// Run the test with the auth file.
		await use(fileName);

		// Clear the data after the test.
		await clearUserData(user);
		await fs.unlink(fileName);
	},
});
