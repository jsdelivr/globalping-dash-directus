import { createError } from '@directus/errors';
import type { EventContext } from '@directus/types';
import Joi from 'joi';
import { getExtraAdoptionTokens } from '../repositories/directus.js';
import type { ExtraAdoptionToken } from '../types.js';

const InvalidEntriesError = createError('INVALID_PAYLOAD_ERROR', '"extra_adoption_tokens" must be a list of { github_username, token }.', 400);
const MultipleOrgsError = createError('INVALID_PAYLOAD_ERROR', '"extra_adoption_tokens" can only be updated one org at a time.', 400);
const AddedEntriesError = createError('INVALID_PAYLOAD_ERROR', '"extra_adoption_tokens" accepts removals only.', 400);

const entriesSchema = Joi.array<ExtraAdoptionToken[]>().items(Joi.object({
	github_username: Joi.string().required(),
	token: Joi.string().required(),
})).error(() => new InvalidEntriesError());

export const validateExtraAdoptionTokens = async (value: unknown, orgIds: string[], context: EventContext) => {
	const [ orgId ] = orgIds;

	if (!orgId || orgIds.length > 1) {
		throw new MultipleOrgsError();
	}

	const { error, value: entries } = entriesSchema.validate(value);

	if (error) {
		throw error;
	}

	const stored = new Set((await getExtraAdoptionTokens(orgId, context)).map(entry => entry.token));
	const next = new Set(entries.map(entry => entry.token));

	const duplicated = next.size !== entries.length;
	const added = [ ...next ].some(token => !stored.has(token));

	if (duplicated || added) {
		throw new AddedEntriesError();
	}
};
