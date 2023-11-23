import type { Request, Response } from 'express';
import { defineEndpoint } from '@directus/extensions-sdk';
import { generateToken } from '../utils/token';

export default defineEndpoint((router) => {
	router.get('/', async (_req: Request, res: Response) => {
		const token = await generateToken();
		res.send({
			data: token,
		});
	});
});
