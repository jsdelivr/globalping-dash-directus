import axios from 'axios';
import { client as sql } from '../../client.ts';

// Manual-trigger flows seeded in seeds/development/08-flow-triggers.js; they let the crons run on demand.
export const FLOW = {
	adoptedProbesCredits: '675f2298-8e04-4f70-855d-acd55d346897',
	probesStatus: 'dc4d3f1d-ef46-4fb0-83af-dbcf7e234a27',
	lowCredits: '9fce4936-773d-4942-bfb1-fc608dfda174',
	removeBannedUsers: 'f2173a49-8431-4f51-b09f-981395de3f54',
	sponsors: 'ad6a7af9-dc7d-4c49-8b15-95d063e83592',
	checkMembers: 'ccdde62b-6f94-456e-8f24-73bb22d38547',
	// Created by 20230914GP-add-github-webhook-handler.js, not by the seed.
	githubWebhook: 'e8a4c2b2-3ed4-4ddc-b98e-34c1952c2323',
} as const;

export const trigger = (flowId: string) => axios.get(`${process.env.DIRECTUS_URL}/flows/trigger/${flowId}`);

export const onlineTimesById = async (ids: string[]) => {
	const rows = await sql('gp_probes').whereIn('id', ids).select('id', 'onlineTimesToday');
	return Object.fromEntries(rows.map(row => [ row.id, row.onlineTimesToday ])) as Record<string, number>;
};
