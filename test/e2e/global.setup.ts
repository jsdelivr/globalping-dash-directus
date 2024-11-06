import pm2, { StartOptions } from 'pm2';
import { execa } from 'execa';
import { test as setup } from '@playwright/test';
import { client as sql } from './utils/client.ts';
import { promisify } from 'util';

const waitFor = (url: string) => execa`./scripts/wait-for.sh -t 10 ${url}`;

const getIsRunning = async (url: string) => {
	try {
		await execa`./scripts/wait-for.sh -t 2 ${url}`;
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

const start = promisify(pm2.start.bind(pm2)) as (options: StartOptions) => Promise<void>;

setup('docker compose start', async () => {
	await Promise.all([ (async () => {
		const isDirectusRunning = await getIsRunning('http://localhost:18055');

		if (isDirectusRunning) { return; }

		await execa`docker compose start`;
		await waitFor('http://localhost:18055');
	})(), (async () => {
		const isDashRunning = await getIsRunning('http://localhost:13010');

		if (isDashRunning) { return; }

		await start({
			name: 'dashboard',
			script: 'test/e2e/globalping-dash/.output/server/index.mjs',
			env: {
				PORT: '13010',
			},
		});

		await waitFor('http://localhost:13010');
	})() ]);
});

setup('init db', async () => {
	await sql.seed.run();
});

setup('authenticate', async ({ request }) => {
	const authFile = 'test/e2e/user.json';
	await request.post('http://localhost:18055/auth/login', {
		data: {
			email: 'user@example.com',
			password: 'user',
			mode: 'session',
		},
	});

	await request.storageState({ path: authFile });
});
