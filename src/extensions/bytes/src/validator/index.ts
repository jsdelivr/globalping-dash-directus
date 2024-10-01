import { defineHook } from '@directus/extensions-sdk';
import { hashBytes } from '../utils/bytes.js';

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
	// GP_TOKENS

	filter('gp_tokens.items.create', (payload) => {
		const token = payload as Token;
		const hashedToken = hashBytes(token.value);
		token.value = hashedToken;
	});

	filter('gp_tokens.items.update', (payload) => {
		const token = payload as Partial<Token>;

		if (token.value === undefined) {
			return;
		}

		const hashedToken = hashBytes(token.value);
		token.value = hashedToken;
	});

	// GP_APPS

	filter('gp_apps.items.create', (payload) => {
		const app = payload as App;

		if (app.secrets === undefined) {
			return;
		}

		app.secrets = app.secrets.map(secret => isHashed(secret) ? secret : hashBytes(secret));
	});

	filter('gp_apps.items.update', (payload) => {
		const app = payload as Partial<App>;

		if (app.secrets === undefined) {
			return;
		}

		app.secrets = app.secrets.map(secret => isHashed(secret) ? secret : hashBytes(secret));
	});
});
