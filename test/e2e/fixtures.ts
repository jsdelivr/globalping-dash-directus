import { test as baseTest, request, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { client as sql } from './client.ts';
import { clearUserData, generateUser } from './utils.ts';
import { User } from './types.ts';

export * from '@playwright/test';
export const test = baseTest.extend<{ user: User; user2: User; admin: User; adminPage: Page }>({
	user: async ({}, use) => {
		const user = await generateUser();
		use(user);
	},
	user2: async ({}, use) => {
		const user2 = await generateUser('2');
		use(user2);
	},
	admin: async ({}, use) => {
		const admin = await generateUser('Admin', 'Administrator');
		use(admin);
	},
	adminPage: async ({ browser, admin, baseURL }, use) => {
		await sql('directus_users').insert(admin);
		const context = await browser.newContext({ baseURL });
		const loginResponse = await context.request.post(`${process.env.DIRECTUS_URL}/auth/login`, {
			data: {
				email: admin.email,
				password: 'user',
				mode: 'session',
			},
		});

		if (!loginResponse.ok()) {
			throw new Error(`${loginResponse.status()} ${loginResponse.statusText()}`);
		}

		await context.addInitScript(() => {
			sessionStorage.setItem('adminConfig', JSON.stringify({ adminMode: true, impersonation: null }));
		});

		const page = await context.newPage();
		await use(page);
		await context.close();
		await clearUserData(admin);
	},
	storageState: async ({ user, user2 }, use) => {
		await sql('directus_users').insert(user);
		await sql('directus_users').insert(user2);

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
		await clearUserData(user2);
		await fs.unlink(fileName);
	},
});
