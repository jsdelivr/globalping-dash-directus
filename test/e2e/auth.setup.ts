import { test as setup } from '@playwright/test';

const authFile = 'test/e2e/user.json';

setup('authenticate', async ({ request }) => {
	await request.post('http://localhost:18055/auth/login', {
		data: {
			email: 'user@example.com',
			password: 'user',
			mode: 'session',
		},
	});

	await request.storageState({ path: authFile });
});
