import axios, { type AxiosInstance } from 'axios';
import { expect } from '@playwright/test';
import { client as sql } from './client.ts';
import { Org, User } from './types.ts';
import { loginUser } from './utils.ts';

export type GithubOrg = { id: number; login: string };

export const prepareMockGithub = async (user: User, memberships: { role: string; state: string; organization: GithubOrg }[], orgs: GithubOrg[] = [], login = 'e2e-github-user', restrictedOrgs: string[] = []) => {
	await axios.post(`${process.env.DIRECTUS_URL}/e2e-mocks/github/state`, {
		token: user.github_oauth_token,
		username: login,
		githubId: Number(user.external_identifier),
		memberships,
		orgs,
		restrictedOrgs,
	});
};

export const membership = (id: number, login: string, role = 'member') => ({ state: 'active', role, organization: { id, login } });

export const sync = async (user: User) => {
	const api = await loginUser(user);
	const response = await api.post('/sync-github-data', { userId: user.id });
	expect(response.status).toBe(200);
};

export const getMemberships = (user: User) => {
	return sql('gp_org_members as m')
		.join('gp_orgs as o', 'o.id', 'm.org')
		.where({ 'm.user': user.id })
		.orderBy('o.github_id')
		.select('o.github_id', 'o.name', 'm.role', 'm.id');
};

export const getOrgWithAccount = async (githubId: string) => {
	const org = await sql('gp_orgs').where({ github_id: githubId }).first('id', 'name', 'adoption_token');
	const account = await sql('gp_accounts').where({ org: org.id }).first('id');
	return { ...org, account_id: account.id as string } as Org;
};

export const createOrgToken = async (api: AxiosInstance, accountId: string) => {
	const token = await api.post('/items/gp_tokens', {
		name: 'e2e-org-token',
		value: (await api.post('/bytes')).data.data,
		account_id: accountId,
	});

	expect(token.status).toBe(200);
	return token.data.data.id as string;
};

export const getSelectedOrgs = async (user: User) => {
	const row = await sql('directus_users').where({ id: user.id }).first('selected_orgs');
	return JSON.parse(row.selected_orgs) as string[];
};

export const selectOrgs = (user: User, orgIds: string[]) => {
	return sql('directus_users').where({ id: user.id }).update({ selected_orgs: JSON.stringify(orgIds) });
};
