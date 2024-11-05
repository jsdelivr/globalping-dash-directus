import pm2 from 'pm2';
import { execa } from 'execa';
import { test as teardown } from '@playwright/test';

teardown('docker compose stop', async () => {
	await execa`docker compose stop`;
	await new Promise<void>((resolve, reject) => pm2.delete('dashboard', err => err ? reject(err) : resolve()));
});
