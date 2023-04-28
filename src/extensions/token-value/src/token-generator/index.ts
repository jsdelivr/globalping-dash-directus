import { defineEndpoint } from '@directus/extensions-sdk';
import TTLCache from '@isaacs/ttlcache';
import { nanoid } from 'nanoid';

export const tokens = new TTLCache({ ttl: 30 * 60 * 1000 });

export default defineEndpoint((router) => {
	router.get('/', (_req, res) => {
        const id = nanoid(32);
        tokens.set(id, true);
        res.send({
            data: id.toString()
        });
    });
});
