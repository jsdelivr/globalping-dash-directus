import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { createError } from '@directus/errors';
import TTLCache from '@isaacs/ttlcache';
import { base32 } from '@scure/base';

const getRandomBytes = promisify(randomBytes);

const TokenEmptyError = createError('INVALID_PAYLOAD_ERROR', 'Token value is empty', 400);

export const WrongTokenError = createError('INVALID_PAYLOAD_ERROR', 'Token value is wrong, please regenerate the token', 400);

const tokens = new TTLCache<string, Buffer>({ ttl: 30 * 60 * 1000 });

export const generateToken = async (bytesAmount: number) => {
	const bytes = await getRandomBytes(bytesAmount);
	const token = base32.encode(bytes).toLowerCase();
	tokens.set(token, bytes);
	return token;
};

export const hashToken = (token?: string) => {
	if (!token) {
		throw new TokenEmptyError();
	}

	const bytes = tokens.get(token);

	if (!bytes) {
		throw new WrongTokenError();
	}

	const hash = createHash('sha256').update(bytes).digest('base64');
	tokens.delete(token);

	return hash;
};
