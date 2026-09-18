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
	// Org logins whose OAuth App access restriction hides the org from the token owner's own membership endpoint.
	restrictedOrgs: string[];
};

const states = new TTLCache<string, GithubState>({ ttl: 30 * 60 * 1000 });

// The sponsorship queries are about the jsDelivr org rather than about the caller, so they read one shared list.
type SponsorEdge = { login: string; githubId: number; monthlyAmount: number; isActive?: boolean; isOneTimePayment?: boolean; tierId?: string };
let sponsors: SponsorEdge[] = [];
let sponsorsActivities: unknown[] = [];

// Clients spell the scheme differently - octokit sends `token`, axios `Bearer` - and the token itself is what identifies the state.
const getToken = (req: Request) => (req.headers.authorization ?? '').replace(/^(bearer|token)\s+/i, '');

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

	if (!state) {
		return proxy(req, res);
	}

	const body = value(state);
	return body === undefined ? res.status(404).send({ message: 'Not Found' }) : res.send(body);
};

export const githubRoutes = (router: Router) => {
	router.post('/github/state', (req, res) => {
		const { token, ...state } = req.body as GithubState & { token: string };
		states.set(token, { username: state.username ?? 'e2e-github-user', githubId: state.githubId ?? 0, memberships: state.memberships ?? [], orgs: state.orgs ?? [], restrictedOrgs: state.restrictedOrgs ?? [] });
		res.sendStatus(200);
	});

	router.get('/github/user/memberships/orgs', (req, res) => answer(req, res, state => state.memberships));

	router.get('/github/user/:githubId/orgs', (req, res) => answer(req, res, state => state.orgs));

	router.get('/github/user/memberships/orgs/:org', (req, res) => {
		const state = states.get(getToken(req));

		if (!state) {
			return proxy(req, res);
		}

		if (state.restrictedOrgs.includes(req.params.org)) {
			return res.status(403).send({ message: 'Forbidden' });
		}

		const membership = state.memberships.find(item => item.organization.login === req.params.org);
		return membership ? res.send(membership) : res.status(404).send({ message: 'Not Found' });
	});

	router.post('/github/sponsors/state', (req, res) => {
		const state = req.body as { sponsors?: SponsorEdge[]; activities?: unknown[] };
		sponsors = state.sponsors ?? [];
		sponsorsActivities = state.activities ?? [];
		res.send({ ok: true });
	});

	router.post('/github/graphql', (req, res) => {
		const { query, variables } = req.body as { query: string; variables: Record<string, string> };

		if (query.includes('sponsorshipsAsMaintainer')) {
			return res.send({
				data: {
					organization: {
						sponsorshipsAsMaintainer: {
							pageInfo: { hasNextPage: false, endCursor: null },
							edges: sponsors.map(sponsor => ({
								node: {
									sponsorEntity: { login: sponsor.login, databaseId: sponsor.githubId },
									isActive: sponsor.isActive ?? true,
									isOneTimePayment: sponsor.isOneTimePayment ?? false,
									tierSelectedAt: new Date().toISOString(),
									tier: { id: sponsor.tierId ?? `tier-${sponsor.githubId}`, monthlyPriceInDollars: sponsor.monthlyAmount },
								},
							})),
						},
					},
				},
			});
		}

		if (query.includes('sponsorsActivities')) {
			return res.send({
				data: { organization: { sponsorsActivities: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: sponsorsActivities } } },
			});
		}

		if (!states.get(getToken(req))) {
			return proxy(req, res);
		}

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
				organizations: { nodes: member.memberships.map(item => ({ databaseId: item.organization.id, login: item.organization.login })) },
			};
		});

		return res.send({ data, ...errors.length ? { errors } : {} });
	});

	router.get('/github/user/:githubId', (req, res) => answer(req, res, () => {
		const known = [ ...states.values() ].find(item => item.githubId.toString() === req.params.githubId);
		return known ? { login: known.username } : undefined;
	}));
};
