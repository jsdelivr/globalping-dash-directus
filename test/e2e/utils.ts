import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { client } from './client.ts';
import { Actors, Org, User } from './types.ts';

export const generateUser = async (suffix = ''): Promise<User> => {
	const userId = randomUUID();
	const userRole = await client('directus_roles').where({ name: 'User' }).select('id').first();

	const user = {
		id: userId,
		external_identifier: randomExternalId(),
		email: `${userId.split('-')[0]}@example.com`,
		role: userRole.id,
		first_name: `Elliot${suffix}`,
		last_name: `Reid${suffix}`,
		password: '$argon2id$v=19$m=65536,t=3,p=4$UAmnqQvr4aGkytr3SIr68Q$aglm45P0itFgFKfyWyKOgVLXzZvCZHQJJR3geuAZgwU', // password: user
		provider: 'default',
		email_notifications: 0,
		github_organizations: JSON.stringify([ `Scrubs${suffix}` ]),
		github_username: `elliot${suffix}`,
		user_type: 'sponsor',
		adoption_token: `dyhiwcyu36tbzgqp5jiu3lpvuxdn6too${suffix}`,
		default_prefix: `elliot${suffix}`,
		// Code sends sync request to GH with github_oauth_token as header, and e2e GH mock reads it to auth as user, so we need github_oauth_token === token.
		github_oauth_token: `e2e-github-${userId}`,
		token: `e2e-github-${userId}`,
	};

	await client('directus_users').insert(user);

	// The account row is created by a trigger when the user is inserted.
	const account = await client('gp_accounts').where({ user: userId }).first('id') as { id: string };
	return { ...user, account_id: account.id };
};

export const generateOrg = async (suffix = ''): Promise<Org> => {
	const [ admin, member, viewer ] = await Promise.all([
		generateUser(`Admin${suffix}`),
		generateUser(`Member${suffix}`),
		generateUser(`Viewer${suffix}`),
	]);

	const org = {
		id: randomUUID(),
		name: `Sacred Heart ${randomExternalId()}`,
		github_id: randomExternalId(),
		adoption_token: randomBytes(16).toString('hex'),
	};

	await client('gp_orgs').insert(org);

	await client('gp_org_members').insert([
		{ id: randomUUID(), org: org.id, user: admin.id, role: 'admin' },
		{ id: randomUUID(), org: org.id, user: member.id, role: 'member' },
		{ id: randomUUID(), org: org.id, user: viewer.id, role: 'viewer' },
	]);

	// The account row is created by a trigger when the org is inserted.
	const account = await client('gp_accounts').where({ org: org.id }).first('id');

	return { ...org, account_id: account.id as string, admin, member, viewer };
};

// Deleting the org cascades to the memberships, the account and everything bound to it; probes only lose the account.
export const clearOrgData = async (org: Org) => {
	await client('gp_probes').where({ account_id: org.account_id }).delete();
	await client('gp_orgs').where({ id: org.id }).delete();
	await Promise.all([ clearUserData(org.admin), clearUserData(org.member), clearUserData(org.viewer) ]);
};

export const prepareMockProbeByIp = async (ip: string) => {
	await axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/globalping/state`, { ip });
};

export const getAdoptionCode = async (ip: string) => {
	for (let attempt = 0; attempt < 50; attempt++) {
		const { data } = await axios.get<{ code: string | null }>(`${process.env.DIRECTUS_URL}/e2e-mocks/globalping/adoption-code`, { params: { ip } });

		if (data.code) {
			return data.code;
		}

		await setTimeout(100);
	}

	throw new Error(`No adoption code was sent to ${ip}.`);
};

// A minimal synced probe row; the owner columns and anything else a test cares about are passed in.
export const addProbe = async (fields: Record<string, unknown>) => {
	const id = randomUUID();

	await client('gp_probes').insert({
		id,
		userId: null,
		account_id: null,
		ip: randomIP(),
		altIps: JSON.stringify([]),
		uuid: randomUUID(),
		name: 'e2e-probe',
		tags: JSON.stringify([]),
		systemTags: JSON.stringify([ 'datacenter-network' ]),
		status: 'ready',
		version: '0.28.0',
		nodeVersion: 'v22.22.3',
		city: 'Prague',
		country: 'CZ',
		countryName: 'Czech Republic',
		continent: 'EU',
		continentName: 'Europe',
		region: 'Eastern Europe',
		latitude: 50.07,
		longitude: 14.42,
		asn: 16019,
		network: 'Vodafone Czech Republic a.s.',
		allowedCountries: JSON.stringify([ 'CZ' ]),
		lastSyncDate: new Date(),
		...fields,
	});

	return id;
};

// A Directus client acting as the given account. Errors are returned, not thrown, so that tests can assert on the status.
const login = async (email: string, password: string) => {
	const { data } = await axios.post(`${process.env.DIRECTUS_URL}/auth/login`, { email, password });

	return axios.create({
		baseURL: process.env.DIRECTUS_URL,
		headers: { Authorization: `Bearer ${data.data.access_token}` },
		validateStatus: () => true,
	});
};

export const loginUser = (user: User) => login(user.email, 'user');

export const loginDirectusAdmin = () => login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);

// Every actor a permission applies to - the Directus admin is not one of them, it bypasses the permissions.
export const allUsers = ({ admin, member, viewer, outsider, otherOrgAdmin }: Actors) => [ admin, member, viewer, outsider, otherOrgAdmin ];

export const clearUserData = async (user: User) => {
	await client('gp_credits_additions').where({ github_id: user.external_identifier }).delete();
	await client('gp_credits').where({ user_id: user.id }).delete();
	await client('gp_credits_deductions').where({ user_id: user.id }).delete();
	await client('gp_probes').where({ userId: user.id }).delete();
	await client('gp_tokens').where({ user_created: user.id }).delete();
	await client('gp_apps').where({ user_created: user.id }).delete();
	await client('gp_apps_approvals').where({ user: user.id }).delete();
	await client('directus_users').where({ id: user.id }).delete();
};

const randomExternalId = () => {
	const randomNumber = Math.floor(Math.random() * 10000000);
	const randomCode = randomNumber.toString().padStart(7, '0');
	return randomCode;
};

export const randomToken = () => {
	return randomBytes(20).toString('base64');
};

export const randomIP = () => {
	return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
};
