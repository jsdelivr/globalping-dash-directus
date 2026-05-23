import { defineHook } from '@directus/extensions-sdk';
import type { Accountability } from '@directus/types';
import jwt from 'jsonwebtoken';

type ApmAgent = {
	setUserContext: (context: { id: string; username: string }) => void;
};

type ApmUser = {
	github_username?: null | string;
	id: string;
};

type TokenPayload = Partial<ApmUser> & {
	id?: string;
};

type Request = {
	accountability?: Accountability | null;
	token?: string;
};

declare global {
	var __elasticApmAgent: ApmAgent | undefined;
}

export const applyApmUserContext = (user: ApmUser | undefined, apmAgent: ApmAgent | undefined) => {
	if (!apmAgent || !user) {
		return;
	}

	apmAgent.setUserContext({
		id: user.id,
		username: user.github_username || `ID(${user.id})`,
	});
};

const verifyJwtPayload = (token: string | undefined): TokenPayload | undefined => {
	if (!token || !process.env.SECRET) {
		return undefined;
	}

	try {
		const payload = jwt.verify(token, process.env.SECRET, { issuer: 'directus' });

		if (typeof payload !== 'object') {
			return undefined;
		}

		return {
			github_username: typeof payload.github_username === 'string' || payload.github_username === null ? payload.github_username : undefined,
			id: typeof payload.id === 'string' ? payload.id : undefined,
		};
	} catch {
		return undefined;
	}
};

export default defineHook(({ init }) => {
	init('middlewares.after', ({ app }) => {
		app.use((req: Request, _res: unknown, next: () => void) => {
			if (req.accountability?.user) {
				const tokenPayload = verifyJwtPayload(req.token);
				const user = tokenPayload?.id === req.accountability.user
					? { ...tokenPayload, id: req.accountability.user }
					: { id: req.accountability.user };

				applyApmUserContext(user, globalThis.__elasticApmAgent);
			}

			next();
		});
	});
});
