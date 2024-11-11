import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './test/e2e',
	forbidOnly: !!process.env.CI,
	workers: 1,
	use: {
		baseURL: 'http://localhost:13010',
	},
	timeout: 4000,
	expect: {
		timeout: 2000,
	},

	/* Configure projects for major browsers */
	projects: [
		{ name: 'setup', testMatch: /.*\.setup\.ts/ },

		{
			name: 'teardown', testMatch: /.*\.teardown\.ts/ },

		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				storageState: 'test/e2e/user.json',
			},
			dependencies: [ 'setup' ],
			teardown: 'teardown',
		},
	],
});
