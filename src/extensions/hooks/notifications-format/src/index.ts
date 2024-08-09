import { defineHook } from '@directus/extensions-sdk';
import markdownit from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import type { NextFunction, Request as ExpressRequest, Response } from 'express';
import type { Notification } from '@directus/types';

export type Request = ExpressRequest & {
	accountability?: {
		customParams?: Record<string, unknown>;
	},
};

const md = markdownit();

export default defineHook(({ init, action }) => {
	init('middlewares.after', ({ app }) => {
		app.use((req: Request, _res: Response, next: NextFunction) => {
			// Unknown parameters passed to standard endpoints are removed by Directus. So we are passing them in accountability object.
			if (req.method === 'GET' && req.query.format === 'html') {
				req.accountability = {
					...req.accountability,
					customParams: { format: 'html' },
				};
			}

			next();
		});
	});

	action('notifications.read', ({ payload }, { accountability }) => {
		if ((accountability as Request['accountability'])?.customParams?.format === 'html') {
			payload.forEach((notification: Notification) => {
				if (notification.message) {
					notification.message = sanitizeHtml(md.render(notification.message));
				}
			});
		}
	});
});
