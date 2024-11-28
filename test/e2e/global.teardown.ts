import pm2 from 'pm2';
import { execa } from 'execa';
import { test as teardown } from '@playwright/test';
import { promisify } from 'util';

const pm2Del = promisify(pm2.delete.bind(pm2));
const pm2List = promisify(pm2.list.bind(pm2));

teardown('Stop services', async () => {
	await execa({ stdout: 'inherit' })`docker compose -f docker-compose.e2e.yml stop`;

	const services = await pm2List();

	if (services.find(service => service.name === 'e2e-dash')) {
		console.log('Stopping dashboard...');
		await pm2Del('e2e-dash');
	}
});
