import { execa, execaNode } from 'execa';
import { test as setup } from '@playwright/test';
import { client as sql } from './utils/client.ts';

setup('docker compose start', async () => {
	await Promise.all([ (async () => {
		await execa`docker compose start`;
		await execa`./scripts/wait-for.sh -t 10 http://localhost:18055/admin/login`;
	})(), (async () => {
		console.log(1);
		await execaNode({ env: { PORT: '13010' } })`test/e2e/globalping-dash/.output/server/index.mjs`;
		console.log(2);
		await execa`./scripts/wait-for.sh -t 10 http://localhost:13010`;
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
