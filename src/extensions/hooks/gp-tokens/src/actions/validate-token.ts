import Joi, { ValidationError, type CustomHelpers } from 'joi';
import { createError } from '@directus/errors';
import { Token } from '../index.js';

function findProtocolSymbol (str: string) {
	// Find '://', ':/', and ':' before the first '.'
	const firstPart = str.split('.')[0]!;
	const regex = /(:\/\/|:\/|:)/;

	const match = firstPart.match(regex);
	return match ? match[0] : null;
}

const validateOrigin = (value: string, helpers: CustomHelpers) => {
	const protocolSymbol = findProtocolSymbol(value);

	if (protocolSymbol) {
		value = value.replace(protocolSymbol, '://');
		value = value.replace(/\/+$/, ''); // Remove trailing slashes
	} else if (protocolSymbol === null) {
		value = 'https://' + value;
	}

	try {
		new URL(value);
		return value;
	} catch (err) {
		return helpers.message({ custom: `Invalid URL: ${value}` });
	}
};

const tokenSchema = Joi.object({
	origins: Joi.array().items(Joi.string().custom(validateOrigin)),
}).unknown(true);

export const validateToken = (token: Partial<Token>) => {
	const { value, error } = tokenSchema.validate(token) as { value: Partial<Token>, error: ValidationError };

	if (error) {
		throw new (createError('INVALID_PAYLOAD_ERROR', error.message, 400))();
	}

	Object.assign(token, value);
};
