import type { Request, Response } from 'express';
import { defineEndpoint } from '@directus/extensions-sdk';
import { ForbiddenError } from '@directus/errors';
import { generateToken } from '../utils/token.js';

type DirectusRequest = Request & {
	accountability?: {
		user: string | null;
	}
}

export default defineEndpoint((router) => {
	router.post('/', async (request: Request, res: Response, next) => {
		const req = request as DirectusRequest;

		if (!req.accountability?.user) {
			return next(new ForbiddenError());
		}

		const token = await generateToken();
		res.send({
			data: token,
		});
	});
});
