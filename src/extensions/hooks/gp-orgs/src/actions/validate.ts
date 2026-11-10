import { createError } from '@directus/errors';

const InvalidWebsiteError = createError('INVALID_PAYLOAD_ERROR', '"website" must be a valid https:// URL.', 400);

// The field regex in the schema also accepts some invalid URLs, like a port that is not a number.
export const validateWebsite = (website: unknown) => {
	if (typeof website === 'string' && !URL.canParse(website)) {
		throw new InvalidWebsiteError();
	}
};
