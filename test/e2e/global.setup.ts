import pm2, { StartOptions } from 'pm2';
import { execa } from 'execa';
import { test as setup } from '@playwright/test';
import { client as sql } from './client.ts';
import { promisify } from 'util';

const start = promisify(pm2.start.bind(pm2)) as (options: StartOptions) => Promise<void>;

const waitFor = (url: string) => execa`./scripts/wait-for.sh -t 10 ${url}`;

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

setup('Start services', async () => {
	await Promise.all([ (async () => {
		const isDirectusRunning = await getIsRunning('http://localhost:18055');

		if (isDirectusRunning) { return; }

		await execa`docker compose -f docker-compose.e2e.yml start`;
		await waitFor('http://localhost:18055');
	})(), (async () => {
		const isDashRunning = await getIsRunning('http://localhost:13010');

		if (isDashRunning) { return; }

		await start({
			name: 'e2e-dash',
			script: 'test/e2e/globalping-dash/.output/server/index.mjs',
			env: {
				PORT: '13010',
			},
		});

		await waitFor('http://localhost:13010');
	})() ]);
});

setup('Init db', async () => {
	await sql.seed.run();
});

setup('Authenticate', async ({ request }) => {
	const authFile = 'test/e2e/user.json';
	await request.post('http://localhost:18055/auth/login', {
		data: {
			email: 'e2e@example.com',
			password: 'user',
			mode: 'session',
		},
	});

	await request.storageState({ path: authFile });
});
