import type { ApiExtensionContext } from '@directus/extensions';
import { graphql, GraphqlResponseError } from '@octokit/graphql';
import axios from 'axios';
import { getGithubUrl } from '../../../../lib/src/service-urls.js';
import type { Org, OrgMember } from '../types.js';

const USERS_BATCH_SIZE = 500;
const ORGS_LIMIT = 100;
const REQUEST_TIMEOUT = 5000;

type OwnMembership = 'active' | 'left' | 'org-inaccessible' | 'bad-token';
type Verdict = 'member' | 'left' | 'unknown';

type GraphqlNode = { databaseId: number; organizations: { nodes: ({ databaseId: number } | null)[] } } | null;
type GraphqlData = Record<string, GraphqlNode>;
type GraphqlError = { type?: string; message: string };

const isUserNotFoundError = (error: GraphqlError) => error.type === 'NOT_FOUND' || error.message.includes('Could not resolve to a User');

const githubGet = <T = unknown>(path: string, token: string, context: ApiExtensionContext, options: { maxRedirects?: number } = {}) => {
	return axios.get<T>(`${getGithubUrl(context)}${path}`, {
		timeout: REQUEST_TIMEOUT,
		headers: { Authorization: `Bearer ${token}` },
		validateStatus: null,
		...options,
	});
};

/**
 * Returns membership ids of the members who are no longer in the org on GitHub, verified with the members' OAuth
 * tokens (either own or a fellow member's) - there is no other way to see private memberships.
 *
 * 1. Find a checker: a member whose token works and who is still in the org himself (the self check is authoritative).
 * 2. With the checker's token read every member's org list in bulk - a fellow member sees private memberships too.
 * 3. Anyone the bulk check can't answer for (stale login, 100+ orgs) answers for himself with his own token,
 *    and if that token is dead - through the checker via the REST API.
 */
export const findLeftMemberships = async (org: Org, context: ApiExtensionContext): Promise<string[]> => {
	const membersWithToken = org.members.filter(member => member.githubOauthToken);
	const left: OrgMember[] = [];
	let checker: OrgMember | null = null;

	// 1. Find the checker user whose token will be used for the bulk check.
	for (const member of membersWithToken) {
		const ownMembership = await getOwnMembership(org, member, context);

		if (ownMembership === 'org-inaccessible') {
			throw new Error(`Org ${org.name} restricts the OAuth app, memberships can't be verified.`);
		}

		if (ownMembership === 'active') {
			checker = member;
			break;
		}
	}

	if (!checker) {
		throw new Error(`Org ${org.name} has no member with a working token, memberships can't be verified.`);
	}

	// 2. Bulk check of all members.
	const verdicts = await getVerdicts(org, org.members, checker.githubOauthToken!, context);

	for (const [ member, verdict ] of verdicts) {
		if (verdict === 'left') {
			left.push(member);
		}

		// 3. One-by-one check of the inconclusive ones.
		if (verdict === 'unknown' && await hasLeftOrg(org, member, checker, context)) {
			left.push(member);
		}
	}

	return left.map(member => member.membershipId);
};

// GET /user/memberships/orgs/{org} answers for the token's owner, so it sees even a private membership.
const getOwnMembership = async (org: Org, member: OrgMember, context: ApiExtensionContext): Promise<OwnMembership> => {
	const response = await githubGet<{ state: string }>(`/user/memberships/orgs/${org.name}`, member.githubOauthToken!, context);

	if (response.status === 200 && response.data.state === 'active') {
		return 'active';
	}

	if (response.status === 404) {
		return 'left';
	}

	// Org enabled OAuth App access restriction and not allowed our app.
	if (response.status === 403) {
		return 'org-inaccessible';
	}

	// 401 (dead token) and anything unexpected, e.g. a pending invitation: not usable, but not proof of leaving either.
	return 'bad-token';
};

const getVerdicts = async (org: Org, members: OrgMember[], token: string, context: ApiExtensionContext): Promise<Map<OrgMember, Verdict>> => {
	const verdicts = new Map<OrgMember, Verdict>();
	const membersWithLogin = members.filter(member => member.githubUsername);
	const membersWithoutLogin = members.filter(member => !member.githubUsername);

	// A member without a stored login can't be queried by login at all.
	for (const member of membersWithoutLogin) {
		verdicts.set(member, 'unknown');
	}

	for (let i = 0; i < membersWithLogin.length; i += USERS_BATCH_SIZE) {
		const batch = membersWithLogin.slice(i, i + USERS_BATCH_SIZE);
		const nodes = await fetchMembersByLogin(batch.map(member => member.githubUsername!), token, context);

		batch.forEach((member, index) => {
			verdicts.set(member, getVerdict(org, member, nodes[index] ?? null));
		});
	}

	return verdicts;
};

const getVerdict = (org: Org, member: OrgMember, node: GraphqlNode): Verdict => {
	// The stored login is stale (renamed, or now owned by someone else) - has to be re-checked by the immutable id.
	if (!node || node.databaseId.toString() !== member.githubId) {
		return 'unknown';
	}

	const orgIds = node.organizations.nodes.map(orgNode => orgNode?.databaseId.toString());

	if (orgIds.includes(org.githubId)) {
		return 'member';
	}

	// The list is capped, so a missing org is not conclusive.
	if (node.organizations.nodes.length === ORGS_LIMIT) {
		return 'unknown';
	}

	return 'left';
};

const fetchMembersByLogin = async (logins: string[], token: string, context: ApiExtensionContext): Promise<GraphqlNode[]> => {
	const variableDefinitions = logins.map((_login, index) => `$l${index}: String!`).join(', ');
	const fields = logins.map((_login, index) => `u${index}: user(login: $l${index}) { databaseId organizations(first: ${ORGS_LIMIT}) { nodes { databaseId } } }`).join(' ');
	const query = `query (${variableDefinitions}) { ${fields} }`;
	const variables = Object.fromEntries(logins.map((login, index) => [ `l${index}`, login ]));

	let data: GraphqlData;

	try {
		data = await graphql<GraphqlData>(query, {
			...variables,
			baseUrl: getGithubUrl(context),
			headers: { Authorization: `Bearer ${token}` },
			request: { signal: AbortSignal.timeout(REQUEST_TIMEOUT) },
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

const hasLeftOrg = async (org: Org, member: OrgMember, checker: OrgMember, context: ApiExtensionContext): Promise<boolean> => {
	// The member's own token answers without a login and sees even a private membership, so it goes first.
	if (member.githubOauthToken) {
		const ownMembership = await getOwnMembership(org, member, context);

		if (ownMembership === 'active') {
			return false;
		}

		if (ownMembership === 'left') {
			return true;
		}
	}

	const token = checker.githubOauthToken!;
	const userResponse = await githubGet<{ login: string }>(`/user/${member.githubId}`, token, context);

	// The GitHub account is gone. This is handled by the banned users cron, not here.
	if (userResponse.status !== 200) {
		return false;
	}

	const membershipResponse = await githubGet(`/orgs/${org.name}/members/${userResponse.data.login}`, token, context, {
		// A redirect means the checker himself is not a member anymore - never follow it to the public-only check.
		maxRedirects: 0,
	});

	return membershipResponse.status === 404;
};
