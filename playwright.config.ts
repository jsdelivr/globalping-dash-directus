import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({
	path: './.env.scripts.e2e',
});

const sequential = /tests\/operations\/|@sequential/;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './test/e2e',
	workers: '75%',
	retries: process.env.CI ? 2 : 0,
	use: {
		...devices['Desktop Chrome'],
		baseURL: process.env.DASH_URL,
	},
	forbidOnly: !!process.env.CI,
	reporter: 'list',
	projects: [
		{ name: 'setup', testMatch: /.*\.setup\.ts/, teardown: 'teardown' },

		{ name: 'teardown', testMatch: /.*\.teardown\.ts/ },

		// These tests read or change rows of the whole database, so they run alone, before anything else is started.
		{
			name: 'sequential',
			grep: sequential,
			workers: 1,
			dependencies: [ 'setup' ],
		},

		{
			name: 'parallel',
			grepInvert: sequential,
			dependencies: [ 'sequential' ],
		},
	],
});
