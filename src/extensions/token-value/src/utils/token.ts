import {promisify} from 'node:util';
import {createHash, randomBytes} from 'node:crypto';
import TTLCache from '@isaacs/ttlcache';

const getRandomBytes = promisify(randomBytes);

const tokens = new TTLCache({ ttl: 30 * 60 * 1000 });

export const generateToken = async () => {
    const bytes = await getRandomBytes(24);
    const token = bytes.toString('base64');
    tokens.set(token, bytes);
    return token;
}

export const hashToken = (token?: string) => {
    if (!token) {
        throw new Error('Token value is empty');
    }

    const bytes = tokens.get(token) as Buffer | undefined;

    if (!bytes) {
        throw new Error('Token value is wrong, please regenerate the token')
    }

    const hash = createHash('sha256').update(bytes).digest('base64');
    tokens.delete(token);

    return hash;
}
