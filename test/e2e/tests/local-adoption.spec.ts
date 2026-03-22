import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { test, expect } from '../fixtures.ts';
import { client as sql } from '../client.ts';

const token = '5a0cd64e930ca5fadcf67e8737b8337a7d244d3b84f7c3a82012510baa386754';
let insertedProbeId: string | null = null;

test.afterEach(async () => {
	if (!insertedProbeId) { return; }

	await sql('gp_probes').where({ id: insertedProbeId }).delete();
	insertedProbeId = null;
});

test('Local adoption endpoint adopts probe', async ({ user }) => {
	const probeId = randomUUID();
	insertedProbeId = probeId;
	const probeUuid = randomUUID();
	const probeIp = '34.141.1.11';
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

	await sql('gp_probes').insert({
		id: probeId,
		userId: null,
		ip: probeIp,
		altIps: JSON.stringify([]),
		uuid: probeUuid,
		name: null,
		tags: JSON.stringify([]),
		systemTags: JSON.stringify([ 'datacenter-network' ]),
		status: 'ready',
		isIPv4Supported: 1,
		isIPv6Supported: 0,
		version: '0.28.0',
		nodeVersion: 'v22.16.0',
		hardwareDevice: null,
		hardwareDeviceFirmware: null,
		city: 'Berlin',
		state: null,
		stateName: null,
		country: 'DE',
		countryName: 'Germany',
		continent: 'EU',
		continentName: 'Europe',
		region: 'Western Europe',
		latitude: 52.52,
		longitude: 13.4,
		asn: 396982,
		network: 'Google Cloud',
		allowedCountries: JSON.stringify([ 'DE' ]),
		originalLocation: null,
		customLocation: null,
		localAdoptionServer: JSON.stringify({
			token,
			expiresAt: expiresAt.toISOString(),
			ips: [ probeIp ],
		}),
		lastSyncDate: new Date(),
	});

	const loginRes = await axios.post(`${process.env.DIRECTUS_URL}/auth/login`, {
		email: user.email,
		password: 'user',
	});
	const accessToken = loginRes.data?.data?.access_token;

	expect(typeof accessToken).toBe('string');

	const listRes = await axios.get<{ publicIp: string; localIps: string[] }[]>(`${process.env.DIRECTUS_URL}/local-adoption`, {
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'true-client-ip': probeIp,
		},
	});

	expect(listRes.status).toBe(200);

	expect(listRes.data.some(probe => probe.publicIp === probeIp && probe.localIps.includes(probeIp))).toBe(true);

	const adoptRes = await axios.post(`${process.env.DIRECTUS_URL}/local-adoption/adopt`, {
		token,
	}, {
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'true-client-ip': probeIp,
		},
	});

	expect(adoptRes.status).toBe(200);

	const adoptedProbe = await sql('gp_probes').where({ id: probeId }).first();
	expect(adoptedProbe.userId).toBe(user.id);
});
