import { defineHook } from '@directus/extensions-sdk';
import { hashToken } from '../utils/token.js';

type Token = {
    id: number;
    name: string;
    value: string;
    expire?: string;
    origins?: string;
    date_created: string;
    date_updated?: string;
    user_created: string;
    user_updated?: string;
};

type App = {
	secrets: string[]
}

const isHashed = (str: string) => str.length === 44;

export default defineHook(({ filter }) => {
	filter('gp_tokens.items.create', (payload) => {
		const token = payload as Token;
		const hashedToken = hashToken(token.value);
		token.value = hashedToken;
	});

	filter('gp_tokens.items.update', (payload) => {
		const token = payload as Partial<Token>;

		if (token.value === undefined) {
			return;
		}

		const hashedToken = hashToken(token.value);
		token.value = hashedToken;
	});

	filter('gp_apps.items.create', (payload) => {
		const app = payload as App;
		app.secrets = app.secrets.map(secret => isHashed(secret) ? secret : hashToken(secret));
	});

	filter('gp_apps.items.update', (payload) => {
		const app = payload as Partial<App>;

		if (app.secrets === undefined) {
			return;
		}

		app.secrets = app.secrets.map(secret => isHashed(secret) ? secret : hashToken(secret));
	});
});
