import pm2, { StartOptions } from 'pm2';
import { execa } from 'execa';
import { test as setup } from '@playwright/test';
import { promisify } from 'util';

const DIRECTUS_URL = process.env.DIRECTUS_URL!;
const DASH_URL = process.env.DASH_URL!;
const DASH_INDEX_FILE_PATH = process.env.DASH_INDEX_FILE_PATH!;

const pm2Start = promisify(pm2.start.bind(pm2)) as (options: StartOptions) => Promise<void>;

const waitFor = (url: string, timeout = 30) => execa({ stdout: 'inherit' })`./scripts/wait-for.sh -t ${timeout} ${url}`;

const getIsRunning = async (url: string) => {
	try {
		await waitFor(url, 2);
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

	await execa({ stdout: 'inherit' })`docker compose -f docker-compose.e2e.yml start`;
	await waitFor(DIRECTUS_URL);
	console.log('Directus started.');
};

const startDashboard = async () => {
	const isDashRunning = await getIsRunning(DASH_URL);

	if (isDashRunning) { return; }

	await pm2Start({
		name: 'e2e-dash',
		script: DASH_INDEX_FILE_PATH,
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
