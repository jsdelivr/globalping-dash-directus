import type { ApiExtensionContext } from '@directus/extensions';

export const GITHUB_API_URL = 'https://api.github.com';

export const getGithubUrl = ({ env }: ApiExtensionContext) => {
	return env['ENABLE_E2E_MOCKS'] === true ? `http://127.0.0.1:${env['PORT'] ?? 8055}/e2e-mocks/github` : GITHUB_API_URL;
};

export const getGlobalpingApiUrl = ({ env }: ApiExtensionContext) => {
	return env['ENABLE_E2E_MOCKS'] === true ? `http://127.0.0.1:${env['PORT'] ?? 8055}/e2e-mocks/globalping` : env['GLOBALPING_URL'] as string;
};
