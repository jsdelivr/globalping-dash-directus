import TTLCache from '@isaacs/ttlcache';
import axios from 'axios';
import type { Request, Response, Router } from 'express';
import { GITHUB_API_URL } from '../../../../lib/src/service-urls.js';

type Membership = {
	state: string;
	role: string;
	organization: { id: number; login: string };
};

type GithubState = {
	username: string;
	githubId: number;
	memberships: Membership[];
	orgs: { id: number; login: string }[];
};

const states = new TTLCache<string, GithubState>({ ttl: 30 * 60 * 1000 });

const getToken = (req: Request) => req.headers.authorization?.replace('Bearer ', '') ?? '';

const proxy = async (req: Request, res: Response) => {
	try {
		const response = await axios({
			method: req.method,
			url: `${GITHUB_API_URL}${req.url.replace('/github', '')}`,
			headers: { Authorization: req.headers.authorization },
			data: req.method === 'GET' ? undefined : req.body,
			validateStatus: () => true,
		});

		res.status(response.status).send(response.data);
	} catch (error) {
		res.status(502).send({ error: String(error) });
	}
};

const answer = (req: Request, res: Response, value: (state: GithubState) => unknown) => {
	const state = states.get(getToken(req));
	return state ? res.send(value(state)) : proxy(req, res);
};

export const githubRoutes = (router: Router) => {
	router.post('/github/state', (req, res) => {
		const { token, ...state } = req.body as GithubState & { token: string };
		states.set(token, { username: state.username ?? 'e2e-github-user', githubId: state.githubId ?? 0, memberships: state.memberships ?? [], orgs: state.orgs ?? [] });
		res.sendStatus(200);
	});

	router.get('/github/user/memberships/orgs', (req, res) => answer(req, res, state => state.memberships));

	router.get('/github/user/:githubId/orgs', (req, res) => answer(req, res, state => state.orgs));

	router.get('/github/user/memberships/orgs/:org', (req, res) => {
		const state = states.get(getToken(req));

		if (!state) {
			return proxy(req, res);
		}

		const membership = state.memberships.find(item => item.organization.login === req.params.org);
		return membership ? res.send(membership) : res.status(404).send({ message: 'Not Found' });
	});

	router.post('/github/graphql', (req, res) => {
		if (!states.get(getToken(req))) {
			return proxy(req, res);
		}

		const { variables } = req.body as { variables: Record<string, string> };
		const data: Record<string, unknown> = {};
		const errors: unknown[] = [];

		Object.entries(variables ?? {}).forEach(([ variable, login ]) => {
			const alias = variable.replace('l', 'u');
			const member = [ ...states.values() ].find(item => item.username === login);

			if (!member) {
				data[alias] = null;
				errors.push({ type: 'NOT_FOUND', message: `Could not resolve to a User with the login of '${login}'.`, path: [ alias ] });
				return;
			}

			data[alias] = {
				databaseId: member.githubId,
				organizations: { nodes: member.memberships.map(item => ({ databaseId: item.organization.id })) },
			};
		});

		return res.send({ data, ...errors.length ? { errors } : {} });
	});

	router.get('/github/user/:githubId', (req, res) => answer(req, res, state => ({ login: state.username })));
};
