import pm2, { StartOptions } from 'pm2';
import { execa } from 'execa';
import { test as setup } from '@playwright/test';
import { promisify } from 'util';
import { client as sql } from './client.ts';

const DIRECTUS_URL = 'http://localhost:18055';
const DASH_URL = 'http://localhost:13010';

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
	setup.setTimeout(20000);

	await Promise.all([ (async () => {
		const isDirectusRunning = await getIsRunning(DIRECTUS_URL);

		if (isDirectusRunning) { return; }

		await execa`docker compose -f docker-compose.e2e.yml start`;
		await waitFor(DIRECTUS_URL);
	})(), (async () => {
		const isDashRunning = await getIsRunning(DASH_URL);

		if (isDashRunning) { return; }

		await start({
			name: 'e2e-dash',
			script: 'test/e2e/globalping-dash/.output/server/index.mjs',
			env: {
				PORT: '13010',
			},
		});

		await waitFor(DASH_URL);
	})() ]);
});

setup('Init db', async () => {
	const userRole = await sql('directus_roles').where({ name: 'User' }).select('id').first();
	await sql('directus_users').upsert([{
		id: '940d4737-394d-428f-b9d5-d98bf1f2a066',
		first_name: 'John',
		last_name: 'Doe',
		email: 'e2e@example.com',
		password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
		role: userRole.id,
		provider: 'default',
		external_identifier: '1111111',
		email_notifications: 1,
		github_organizations: JSON.stringify([ 'Scrubs' ]),
		github_username: 'johndoe',
		user_type: 'sponsor',
	}]);
});

setup('Authenticate', async ({ request }) => {
	const authFile = 'test/e2e/user.json';
	await request.post(`${DIRECTUS_URL}/auth/login`, {
		data: {
			email: 'e2e@example.com',
			password: 'user',
			mode: 'session',
		},
	});

	await request.storageState({ path: authFile });
});
