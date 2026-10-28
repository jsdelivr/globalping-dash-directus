import { test as baseTest, request, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs/promises';
import { clearOrgData, clearUserData, generateOrg, generateUser, loginDirectusAdmin, loginUser } from './utils.ts';
import { Actors, Org, User } from './types.ts';

export * from '@playwright/test';
export const test = baseTest.extend<{ user: User; user2: User; org: Org; org2: Org; actors: Actors; admin: User; adminPage: Page }>({
	user: async ({}, use) => {
		const user = await generateUser();
		await use(user);
		await clearUserData(user);
	},
	user2: async ({}, use) => {
		const user2 = await generateUser('2');
		await use(user2);
		await clearUserData(user2);
	},
	org: async ({}, use) => {
		const org = await generateOrg();
		await use(org);
		await clearOrgData(org);
	},
	org2: async ({}, use) => {
		const org2 = await generateOrg('2');
		await use(org2);
		await clearOrgData(org2);
	},
	admin: async ({}, use) => {
		const admin = await generateUser('Admin', 'Administrator');
		await use(admin);
		await clearUserData(admin);
	},
	adminPage: async ({ browser, admin, baseURL }, use) => {
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
	},
	actors: async ({ org, org2, user }, use) => {
		const [ admin, member, viewer, outsider, otherOrgAdmin, directusAdmin ] = await Promise.all([
			loginUser(org.admin),
			loginUser(org.member),
			loginUser(org.viewer),
			loginUser(user),
			loginUser(org2.admin),
			loginDirectusAdmin(),
		]);

		await use({ admin, member, viewer, outsider, otherOrgAdmin, directusAdmin });
	},
	storageState: async ({ user }, use) => {
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

		await fs.unlink(fileName);
	},
});
