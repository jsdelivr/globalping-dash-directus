import type { ApiExtensionContext } from '@directus/extensions';
import TTLCache from '@isaacs/ttlcache';
import axios from 'axios';
import type { Router } from 'express';
import type { ProbeToAdopt } from '../../../../lib/src/create-adopted-probe.js';

const PROBE: Omit<ProbeToAdopt, 'ip'> = {
	altIps: [],
	uuid: '7bac0b3a-f808-48e1-8892-062bab3280f8',
	name: null,
	userId: null,
	account_id: null,
	version: '0.28.0',
	nodeVersion: 'v22.22.3',
	hardwareDevice: null,
	hardwareDeviceFirmware: null,
	tags: [],
	systemTags: [],
	status: 'offline',
	allowedCountries: [ 'BF' ],
	city: 'Ouagadougou',
	state: null,
	stateName: null,
	country: 'BF',
	countryName: 'Burkina Faso',
	continent: 'AF',
	continentName: 'Africa',
	region: 'Western Africa',
	latitude: 12.37,
	longitude: -1.53,
	asn: 3302,
	network: 'e2e network provider',
	isIPv4Supported: true,
	isIPv6Supported: false,
	customLocation: null,
	originalLocation: null,
	localAdoptionServer: null,
};

const probeIps = new TTLCache<string, true>({ ttl: 30 * 60 * 1000 });
const codes = new TTLCache<string, string>({ ttl: 30 * 60 * 1000 });

export const globalpingRoutes = (router: Router, env: ApiExtensionContext['env']) => {
	router.post('/globalping/state', (req, res) => {
		probeIps.set((req.body as { ip: string }).ip, true);
		res.sendStatus(200);
	});

	router.post('/globalping/adoption-code', async (req, res) => {
		const { ip, code } = req.body as { ip: string; code: string };

		if (!probeIps.has(ip)) {
			try {
				const response = await axios.post(`${env.GLOBALPING_URL}/adoption-code`, req.body, {
					headers: { 'X-Api-Key': req.headers['x-api-key'] },
					validateStatus: () => true,
				});

				res.status(response.status).send(response.data);
			} catch (error) {
				res.status(502).send({ error: String(error) });
			}

			return;
		}

		codes.set(ip, code);
		res.send({ ...PROBE, ip });
	});

	// Real adoption code is only shown in probe logs, so we are using GET to get it in e2e.
	router.get('/globalping/adoption-code', (req, res) => {
		const ip = req.query.ip as string;
		const code = codes.get(ip) ?? null;
		codes.delete(ip);
		res.send({ code });
	});
};
