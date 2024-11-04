import { test as setup } from '@playwright/test';
import { client as sql } from './utils/client.ts';

setup('docker', async () => {
});

setup('db', async () => {
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
