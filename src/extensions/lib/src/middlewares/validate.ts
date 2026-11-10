import type { ApiExtensionContext } from '@directus/extensions';
import type { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { validateAccountId } from '../accounts.js';
import { asyncWrapper } from '../async-wrapper.js';

type RolesPermissions = { roles: string[]; context: ApiExtensionContext };
type AccountRequest = Request & { accountability: { user: string; admin: boolean } };

const validateRequest = (schema: Joi.ObjectSchema, req: Request, res: Response) => {
	const { value, error } = schema.validate(req);

	if (error) {
		res.status(400).send(error.message);
		return false;
	}

	value.body && (req.body = value.body);
	value.query && (req.query = value.query);
	return true;
};

const hasAccountId = (schema: Joi.ObjectSchema) => {
	const { keys } = schema.describe();
	return !!(keys.body?.keys?.accountId || keys.query?.keys?.accountId);
};

// A schema with `accountId` must say which org roles may act on the account.
export const validate = (schema: Joi.ObjectSchema, rolesPermissions?: RolesPermissions) => {
	if (hasAccountId(schema) !== !!rolesPermissions) {
		throw new Error('Pass `rolesPermissions` for a schema with `accountId`, and only for it.');
	}

	if (!rolesPermissions) {
		return (req: Request, res: Response, next: NextFunction) => {
			if (validateRequest(schema, req, res)) { next(); }
		};
	}

	return asyncWrapper(async (req, res, next) => {
		if (!validateRequest(schema, req, res)) { return; }

		await validateAccountId(req.body.accountId ?? req.query.accountId, (req as AccountRequest).accountability, rolesPermissions.context, rolesPermissions.roles);
		next();
	}, rolesPermissions.context);
};
