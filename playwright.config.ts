import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './test/e2e',
	workers: 1,
	use: {
		baseURL: process.env.SERVER_URL,
	},
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? 'list' : 'line',
	projects: [
		{ name: 'setup', testMatch: /.*\.setup\.ts/ },

		{
			name: 'teardown', testMatch: /.*\.teardown\.ts/ },

		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
			dependencies: [ 'setup' ],
			teardown: 'teardown',
		},
	],
});
