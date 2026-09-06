import type { EndpointExtensionContext } from '@directus/extensions';
import { defineEndpoint } from '@directus/extensions-sdk';
import type { EventContext } from '@directus/types';
import type { Request, RequestHandler, Router } from 'express';
import Joi from 'joi';
import { asyncWrapper } from '../../../lib/src/async-wrapper.js';
import { getGithubApiClient } from '../../../lib/src/github-api-client.js';
import { validate } from '../../../lib/src/middlewares/validate.js';
import { resolveSponsorsPeriod } from './period.js';
import { getManualAdditions, getSponsorAccounts, getSponsorsSummary, getSponsorshipEvents } from './queries.js';
import type {
	AccountsQuery,
	EventsQuery,
	ManualAddition,
	ManualAdditionsQuery,
	PageResult,
	SponsorAccount,
	SponsorsPeriod,
	SponsorsPeriodRange,
	SponsorsSummary,
	SponsorshipEvent,
} from './types.js';

type QueryService = {
	getSummary: (database: EndpointExtensionContext['database'], range: SponsorsPeriodRange) => Promise<SponsorsSummary>;
	getEvents: (database: EndpointExtensionContext['database'], range: SponsorsPeriodRange, query: EventsQuery) => Promise<PageResult<SponsorshipEvent>>;
	getAccounts: (database: EndpointExtensionContext['database'], range: SponsorsPeriodRange, query: AccountsQuery) => Promise<PageResult<SponsorAccount>>;
	getManualAdditions: (database: EndpointExtensionContext['database'], query: ManualAdditionsQuery) => Promise<PageResult<ManualAddition>>;
};

type GithubAccount = {
	id: number;
	login: string;
};

type GithubAccountResolver = (githubId: string, context: EndpointExtensionContext) => Promise<GithubAccount>;

const periodSchema = Joi.string().default('past-year').custom((value, helpers) => {
	try {
		resolveSponsorsPeriod(value);
		return value;
	} catch {
		return helpers.error('any.invalid');
	}
});

const csvSchema = <T extends string>(values: T[]) => Joi.string().custom((value, helpers) => {
	const parsed = value.split(',');

	if (!parsed.length || parsed.some((item: string) => !values.includes(item as T))) {
		return helpers.error('any.invalid');
	}

	return parsed;
});

const paginationSchema = {
	offset: Joi.number().integer().min(0).default(0),
	limit: Joi.number().integer().min(1).max(100).default(10),
	search: Joi.string().trim().max(255).optional(),
};

const summarySchema = Joi.object({
	query: Joi.object({ period: periodSchema }).required(),
}).unknown(true);

const eventsSchema = Joi.object({
	query: Joi.object({
		...paginationSchema,
		period: periodSchema,
		types: csvSchema([ 'recurring_sponsorship', 'one_time_sponsorship', 'tier_changed' ]).optional(),
		sort: Joi.string().valid('date', 'sponsor', 'type', 'sponsorshipValue').default('date'),
		direction: Joi.string().valid('asc', 'desc').default('desc'),
	}).required(),
}).unknown(true);

const accountsSchema = Joi.object({
	query: Joi.object({
		...paginationSchema,
		period: periodSchema,
		statuses: csvSchema([ 'active', 'former', 'one-time' ]).optional(),
		linked: Joi.boolean().truthy('true').falsy('false').optional(),
		sort: Joi.string().valid('sponsor', 'status', 'currentMonthly', 'periodValue', 'events', 'latestEvent').default('latestEvent'),
		direction: Joi.string().valid('asc', 'desc').default('desc'),
	}).required(),
}).unknown(true);

const manualAdditionsSchema = Joi.object({
	query: Joi.object({
		...paginationSchema,
		types: csvSchema([ 'payment', 'other' ]).optional(),
		sort: Joi.string().valid('date', 'sponsor', 'type', 'credits', 'addedBy').default('date'),
		direction: Joi.string().valid('asc', 'desc').default('desc'),
	}).required(),
}).unknown(true);

const createManualAdditionSchema = Joi.object({
	body: Joi.alternatives().try(
		Joi.object({
			type: Joi.string().valid('payment').required(),
			githubId: Joi.string().pattern(/^\d+$/).max(255).required(),
			githubLogin: Joi.string().trim().max(255).required(),
			credits: Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER).required(),
			amountInDollars: Joi.number().positive().precision(2).required(),
		}),
		Joi.object({
			type: Joi.string().valid('other').required(),
			githubId: Joi.string().pattern(/^\d+$/).max(255).required(),
			githubLogin: Joi.string().trim().max(255).required(),
			credits: Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER).required(),
			comment: Joi.string().trim().max(500).pattern(/^[A-Z].*\.$/s).required(),
		}),
	).required(),
}).unknown(true);

type ManualAdditionInput = {
	type: 'payment';
	githubId: string;
	githubLogin: string;
	credits: number;
	amountInDollars: number;
} | {
	type: 'other';
	githubId: string;
	githubLogin: string;
	credits: number;
	comment: string;
};

const resolveGithubAccount: GithubAccountResolver = async (githubId, context) => {
	const client = getGithubApiClient(null, context);

	if (!context.env.GITHUB_ACCESS_TOKEN) {
		delete client.defaults.headers.Authorization;
	}

	const response = await client.get<GithubAccount>(`https://api.github.com/user/${encodeURIComponent(githubId)}`);
	return response.data;
};

const getHttpStatus = (error: unknown): number | undefined => {
	if (typeof error !== 'object' || error === null || !('response' in error)) {
		return;
	}

	const response = error.response;

	if (typeof response !== 'object' || response === null || !('status' in response)) {
		return;
	}

	return typeof response.status === 'number' ? response.status : undefined;
};

export const createAdminSponsorsEndpoint = (queryService: QueryService, githubAccountResolver: GithubAccountResolver = resolveGithubAccount) => (router: Router, context: EndpointExtensionContext) => {
	const allowAdmin: RequestHandler = (req, res, next) => {
		const accountability = (req as Request & { accountability?: EventContext['accountability'] }).accountability;

		if (accountability?.admin !== true) {
			res.status(403).send('Forbidden');
			return;
		}

		next();
	};

	router.use(allowAdmin);

	router.get('/summary', validate(summarySchema), asyncWrapper(async (req, res) => {
		const query = req.query as unknown as { period: SponsorsPeriod };
		const range = resolveSponsorsPeriod(query.period);
		res.send(await queryService.getSummary(context.database, range));
	}, context));

	router.get('/events', validate(eventsSchema), asyncWrapper(async (req, res) => {
		const query = req.query as unknown as EventsQuery;
		const range = resolveSponsorsPeriod(query.period);
		res.send(await queryService.getEvents(context.database, range, query));
	}, context));

	router.get('/accounts', validate(accountsSchema), asyncWrapper(async (req, res) => {
		const query = req.query as unknown as AccountsQuery;
		const range = resolveSponsorsPeriod(query.period);
		res.send(await queryService.getAccounts(context.database, range, query));
	}, context));

	router.get('/manual-additions', validate(manualAdditionsSchema), asyncWrapper(async (req, res) => {
		const query = req.query as unknown as ManualAdditionsQuery;
		res.send(await queryService.getManualAdditions(context.database, query));
	}, context));

	router.post('/manual-additions', validate(createManualAdditionSchema), asyncWrapper(async (req, res) => {
		const accountability = (req as Request & { accountability: EventContext['accountability'] }).accountability;
		const input = req.body as ManualAdditionInput;
		const isPayment = input.type === 'payment';
		let githubAccount: GithubAccount;

		try {
			githubAccount = await githubAccountResolver(input.githubId, context);
		} catch (error) {
			const status = getHttpStatus(error);

			if (status === 404) {
				res.status(400).send('GitHub account not found.');
				return;
			}

			context.logger.error({ githubId: input.githubId, status }, 'GitHub account lookup failed.');
			res.status(503).send('GitHub account lookup is temporarily unavailable.');
			return;
		}

		if (String(githubAccount.id) !== input.githubId
			|| typeof githubAccount.login !== 'string'
			|| githubAccount.login.toLowerCase() !== input.githubLogin.toLowerCase()) {
			res.status(400).send('GitHub account does not match the submitted ID and username.');
			return;
		}

		await context.database('gp_credits_additions').insert({
			github_id: input.githubId,
			amount: input.credits,
			reason: isPayment ? 'one_time_sponsorship' : 'other',
			meta: JSON.stringify(isPayment
				? { amountInDollars: input.amountInDollars, githubLogin: githubAccount.login, manual: true }
				: { comment: input.comment, githubLogin: githubAccount.login, manual: true }),
			date_created: new Date(),
			user_updated: accountability!.user,
		});

		res.sendStatus(201);
	}, context));
};

export default defineEndpoint(createAdminSponsorsEndpoint({
	getSummary: getSponsorsSummary,
	getEvents: getSponsorshipEvents,
	getAccounts: getSponsorAccounts,
	getManualAdditions,
}));
