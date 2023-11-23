import Joi from 'joi';
import { defineEndpoint } from '@directus/extensions-sdk';
import { createError, isDirectusError } from '@directus/errors';
import axios from 'axios';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Request as ExpressRequest } from 'express';
import type { EndpointExtensionContext } from '@directus/extensions';

type Request = ExpressRequest & {
	accountability: {
		user: string;
	},
	schema: object,
};

type GithubUserResponse = {
	login: string;
	id: number;
};

type User = {
	external_identifier?: string;
	github?: string;
}

const NotEnoughDataError = createError('INVALID_PAYLOAD_ERROR', 'Not enough data to check GitHub username', 400);
const TooManyRequestsError = createError('TOO_MANY_REQUESTS', 'Too many requests', 429);

const rateLimiter = new RateLimiterMemory({
	points: 10,
	duration: 60 * 60,
});

const syncGithubUsernameSchema = Joi.object<Request>({
	accountability: Joi.object({
		user: Joi.string().required(),
	}).required().unknown(true),
	body: Joi.object({
		userId: Joi.string().required(),
	}).required(),
}).unknown(true);

export default defineEndpoint((router, context: EndpointExtensionContext) => {
	router.post('/', async (req, res) => {
		const { logger } = context;

		try {
			const { value, error } = syncGithubUsernameSchema.validate(req);

			if (error) {
				throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
			}

			const requesterId = value.accountability.user;
			const userId = value.body.userId;

			await rateLimiter.consume(requesterId, 1).catch(() => { throw new TooManyRequestsError(); });

			await syncGithubUsername(value.accountability, userId, context);

			res.send('Synced');
		} catch (error: unknown) {
			logger.error(error);

			if (isDirectusError(error)) {
				res.status(error.status).send(error.message);
			} else if (axios.isAxiosError(error)) {
				res.status(400).send(error.response?.data?.error?.message);
			} else {
				res.status(500).send('Internal Server Error');
			}
		}
	});
});

const syncGithubUsername = async (accountability: Request['accountability'], userId: string, context: EndpointExtensionContext) => {
	const { services, database, getSchema, env } = context;
	const { ItemsService, UsersService } = services;

	const itemsService = new ItemsService('directus_users', {
		accountability,
		schema: await getSchema({ database }),
		knex: database,
	});

	const user = await itemsService.readOne(userId) as User | undefined;
	const githubId = user?.external_identifier;
	const username = user?.github;

	if (!user || !githubId || !username) {
		throw new NotEnoughDataError();
	}

	const response = await axios.get<GithubUserResponse>(`https://api.github.com/user/${githubId}`, {
		timeout: 5000,
		headers: {
			Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}`,
		},
	});
	const githubUsername = response.data.login;

	if (username !== githubUsername) {
		const usersService = new UsersService({
			schema: await getSchema({ database }),
			knex: database,
		});
		await usersService.updateOne(userId, {
			github: githubUsername,
		});
	}
};
