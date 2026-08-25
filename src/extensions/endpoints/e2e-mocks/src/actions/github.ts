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
	memberships: Membership[];
	orgs: { id: number; login: string }[];
};

const states = new TTLCache<string, GithubState>({ ttl: 30 * 60 * 1000 });

const getToken = (req: Request) => req.headers.authorization?.replace('Bearer ', '') ?? '';

const proxy = async (req: Request, res: Response) => {
	try {
		const response = await axios.get(`${GITHUB_API_URL}${req.url.replace('/github', '')}`, {
			headers: { Authorization: req.headers.authorization },
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
		states.set(token, { username: state.username ?? 'e2e-github-user', memberships: state.memberships ?? [], orgs: state.orgs ?? [] });
		res.sendStatus(200);
	});

	router.get('/github/user/memberships/orgs', (req, res) => answer(req, res, state => state.memberships));

	router.get('/github/user/:githubId/orgs', (req, res) => answer(req, res, state => state.orgs));

	router.get('/github/user/:githubId', (req, res) => answer(req, res, state => ({ login: state.username })));
};
