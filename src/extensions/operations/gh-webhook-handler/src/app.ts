import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
	id: 'gh-webhook-handler',
	name: 'Github webhook handler',
	icon: 'webhook',
	description: 'Handle github "sponsorship" webhook. Add credits for one-time sponsorship. Manage sponsors for recurring sponsorship',
	overview: () => [],
	options: [],
});
