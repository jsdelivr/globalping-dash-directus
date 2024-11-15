import pm2, { StartOptions } from 'pm2';
import { execa } from 'execa';
import { test as setup } from '@playwright/test';
import { promisify } from 'util';

const DIRECTUS_URL = 'http://localhost:18055';
const DASH_URL = 'http://localhost:13010';

const pm2start = promisify(pm2.start.bind(pm2)) as (options: StartOptions) => Promise<void>;

const waitFor = (url: string) => execa`./scripts/wait-for.sh -t 30 ${url}`;

const getIsRunning = async (url: string) => {
	try {
		await execa`./scripts/wait-for.sh -t 2 ${url}`;
		console.log(`Service at ${url} is already running.`);
		return true;
	} catch (err) {
		if (err.stderr === 'Operation timed out') {
			console.log(`Service at ${url} not running. Starting...`);
		} else {
			console.log(err);
		}

		return false;
	}
};

const startDirectus = async () => {
	const isDirectusRunning = await getIsRunning(DIRECTUS_URL);

	if (isDirectusRunning) { return; }

	await execa`docker compose -f docker-compose.e2e.yml start`;
	console.log(1);
	await waitFor(DIRECTUS_URL);
	console.log('Directus started.');
};

const startDashboard = async () => {
	const isDashRunning = await getIsRunning(DASH_URL);

	if (isDashRunning) { return; }

	await pm2start({
		name: 'e2e-dash',
		script: 'test/e2e/globalping-dash/.output/server/index.mjs',
		env: {
			PORT: '13010',
		},
	});

	await waitFor(DASH_URL);
	console.log('Dashboard started.');
};

setup('Start services', async () => {
	setup.setTimeout(60000);
	await Promise.all([ startDirectus(), startDashboard() ]);
});
