import { defineEndpoint } from '@directus/extensions-sdk';
import { generateToken } from '../utils/token';

export default defineEndpoint((router) => {
	router.get('/', async (_req, res) => {
        const token = await generateToken();
        res.send({
            data: token,
        });
    });
});
