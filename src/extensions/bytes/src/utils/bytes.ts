import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { createError } from '@directus/errors';
import TTLCache from '@isaacs/ttlcache';
import { base32 } from '@scure/base';

const getRandomBytes = promisify(randomBytes);

const ValueEmptyError = createError('INVALID_PAYLOAD_ERROR', 'Bytestring value is empty', 400);

export const WrongValueError = createError('INVALID_PAYLOAD_ERROR', 'Bytestring value is wrong, please regenerate the value', 400);

const bytesMap = new TTLCache<string, Buffer>({ ttl: 30 * 60 * 1000 });

export const generateBytes = async (bytesAmount: number) => {
	const bytes = await getRandomBytes(bytesAmount);
	const byteString = base32.encode(bytes).toLowerCase();
	bytesMap.set(byteString, bytes);
	return byteString;
};

export const hashBytes = (byteString?: string) => {
	if (!byteString) {
		throw new ValueEmptyError();
	}

	const bytes = bytesMap.get(byteString);

	if (!bytes) {
		throw new WrongValueError();
	}

	return createHash('sha256').update(bytes).digest('base64');
};

export const deleteBytes = (byteString: string) => {
	bytesMap.delete(byteString);
};

export const isHashed = (str: string) => str.length === 44;
