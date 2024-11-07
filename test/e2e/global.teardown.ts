import pm2 from 'pm2';
import { execa } from 'execa';
import { test as teardown } from '@playwright/test';
import { promisify } from 'util';

const del = promisify(pm2.delete.bind(pm2));
const list = promisify(pm2.list.bind(pm2));

teardown('Stop services', async () => {
	await execa`docker compose -p e2e-dash-directus stop`;

	const services = await list();

	if (services.find(service => service.name === 'e2e-dash')) {
		console.log('Removing FE service...');
		await del('e2e-dash');
	}
});
