import { test as baseTest, request } from '@playwright/test';
import { client as sql, clearUserData, generateUser } from './client.ts';
import path from 'path';
import fs from 'fs/promises';

const DIRECTUS_URL = 'http://localhost:18055';

export * from '@playwright/test';
export const test = baseTest.extend({
	storageState: async ({}, use) => {
		const user = await generateUser();

		await sql('directus_users').insert(user);

		// Make sure we authenticate in a clean environment by unsetting storage state.
		const context = await request.newContext({ storageState: undefined });
		// Log in the user.
		const loginResponse = await context.post(`${DIRECTUS_URL}/auth/login`, {
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
		// Apply and save auth in file.
		await context.storageState({ path: fileName });

		// Run the test.
		await use(fileName);

		// Clear the data after the test.
		await clearUserData(user.id, user.external_identifier);
		await fs.unlink(fileName);
	},
});
