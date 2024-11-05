import { execa } from 'execa';
import { test as teardown } from '@playwright/test';

teardown('docker compose stop', async () => {
	await execa`docker compose stop`;
});
