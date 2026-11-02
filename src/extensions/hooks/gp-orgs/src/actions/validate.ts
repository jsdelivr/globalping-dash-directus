import { createError } from '@directus/errors';
import type { EventContext } from '@directus/types';
import Joi from 'joi';
import { getExtraAdoptionTokens } from '../repositories/directus.js';
import type { ExtraAdoptionToken } from '../types.js';

const InvalidEntriesError = createError('INVALID_PAYLOAD_ERROR', '"extra_adoption_tokens" must be a list of { github_username, token }.', 400);
const MultipleOrgsError = createError('INVALID_PAYLOAD_ERROR', '"extra_adoption_tokens" can only be updated one org at a time.', 400);
const AddedEntriesError = createError('INVALID_PAYLOAD_ERROR', '"extra_adoption_tokens" accepts removals only.', 400);
const InvalidWebsiteError = createError('INVALID_PAYLOAD_ERROR', '"website" must be a valid https:// URL.', 400);

export const validateWebsite = (website: unknown) => {
	if (typeof website === 'string' && !URL.canParse(website)) {
		throw new InvalidWebsiteError();
	}
};

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

	const getKey = (entry: ExtraAdoptionToken) => JSON.stringify([ entry.github_username, entry.token ]);
	const stored = new Set((await getExtraAdoptionTokens(orgId, context)).map(getKey));
	const next = new Set(entries.map(getKey));

	const duplicated = next.size !== entries.length;
	const added = [ ...next ].some(key => !stored.has(key));

	if (duplicated || added) {
		throw new AddedEntriesError();
	}
};
