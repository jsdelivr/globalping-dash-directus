import { defineHook } from '@directus/extensions-sdk';
import { deleteBytes, hashBytes, isHashed } from '../utils/bytes.js';

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

export default defineHook(({ filter }) => {
	// GP_TOKENS

	filter('gp_tokens.items.create', (payload) => {
		const token = payload as Token;
		const hashedToken = hashBytes(token.value);
		deleteBytes(token.value);
		token.value = hashedToken;
	});

	filter('gp_tokens.items.update', (payload) => {
		const token = payload as Partial<Token>;

		if (token.value === undefined) {
			return;
		}

		const hashedToken = hashBytes(token.value);
		deleteBytes(token.value);
		token.value = hashedToken;
	});

	// GP_APPS

	filter('gp_apps.items.create', (payload) => {
		const app = payload as App;

		if (app.secrets !== undefined) {
			app.secrets = hashSecrets(app.secrets);
		}
	});

	filter('gp_apps.items.update', (payload) => {
		const app = payload as Partial<App>;

		if (app.secrets !== undefined) {
			app.secrets = hashSecrets(app.secrets);
		}
	});
});

const hashSecrets = (secrets: string[]) => {
	const byteStringsToDelete: string[] = [];
	const hashedSecrets = secrets.map((secret) => {
		if (isHashed(secret)) {
			return secret;
		}

		byteStringsToDelete.push(secret);
		return hashBytes(secret);
	});

	byteStringsToDelete.forEach(byteString => deleteBytes(byteString));
	return hashedSecrets;
};
