import type { OperationContext } from '@directus/extensions';
import { graphql, GraphqlResponseError } from '@octokit/graphql';
import axios, { isAxiosError } from 'axios';
import Bluebird from 'bluebird';

const GITHUB_API_URL = 'https://api.github.com';
const BATCH_SIZE = 500;

type User = { external_identifier: string; github_username: string | null };

type GraphqlNode = { databaseId: number } | null;

type GraphqlData = Record<string, GraphqlNode>;

type GraphqlError = { type?: string; message: string };

const isUserNotFoundError = (error: GraphqlError) => error.type === 'NOT_FOUND' || error.message.includes('Could not resolve to a User');

/**
 * Returns the set of external_identifiers that still exist on GitHub.
 *
 * 1. Resolve users by their stored login in bulk via GraphQL.
 * 2. Confirm the leftovers (renamed, banned, or without a stored login) via REST API one by one.
 */
export const getExistingGithubIds = async (users: User[], context: OperationContext): Promise<Set<string>> => {
	const existingIds = new Set<string>();
	const usersForRestCheck = users.filter(user => !user.github_username);
	const usersWithLogin = users.filter(user => !!user.github_username);

	for (let i = 0; i < usersWithLogin.length; i += BATCH_SIZE) {
		const batch = usersWithLogin.slice(i, i + BATCH_SIZE);
		const nodes = await fetchUsersByLogin(batch.map(user => user.github_username!), context);

		batch.forEach((user, index) => {
			const node = nodes[index];

			if (node && node.databaseId.toString() === user.external_identifier) {
				existingIds.add(user.external_identifier);
			} else {
				usersForRestCheck.push(user);
			}
		});
	}

	await Bluebird.map(usersForRestCheck, async (user) => {
		if (await githubUserExistsById(user.external_identifier, context)) {
			existingIds.add(user.external_identifier);
		}
	}, { concurrency: 2 });

	return existingIds;
};

const fetchUsersByLogin = async (logins: string[], { env }: OperationContext): Promise<GraphqlNode[]> => {
	const variableDefinitions = logins.map((_login, index) => `$l${index}: String!`).join(', ');
	const fields = logins.map((_login, index) => `u${index}: user(login: $l${index}) { databaseId }`).join(' ');
	const query = `query (${variableDefinitions}) { ${fields} }`;
	const variables = Object.fromEntries(logins.map((login, index) => [ `l${index}`, login ]));

	let data: GraphqlData;

	try {
		data = await graphql<GraphqlData>(query, {
			...variables,
			headers: { Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}` },
			request: { signal: AbortSignal.timeout(5000) },
		});
	} catch (error) {
		if (!(error instanceof GraphqlResponseError)) {
			throw error;
		}

		const unexpectedErrors = (error.errors as GraphqlError[] ?? []).filter(graphqlError => !isUserNotFoundError(graphqlError));

		if (unexpectedErrors.length) {
			throw error;
		}

		// If some users are missing, octokit throws an error with the partial data.
		data = error.data as GraphqlData;
	}

	return logins.map((_login, index) => data[`u${index}`] ?? null);
};

const githubUserExistsById = async (githubId: string, { env }: OperationContext): Promise<boolean> => {
	try {
		await axios.get(`${GITHUB_API_URL}/user/${githubId}`, {
			timeout: 5000,
			headers: { Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}` },
		});

		return true;
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 404) {
			return false;
		}

		throw error;
	}
};
