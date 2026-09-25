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

type OrgNode = { databaseId: number; login: string };
type GraphqlNode = { databaseId: number; organizations: { nodes: (OrgNode | null)[] } } | null;
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
 * Returns the membership ids of members who have left the org on GitHub.
 *
 * GitHub reveals a private membership only to the member himself or a fellow member, so we verify through a member's token:
 *
 * 1. Pick a checker: a member still in the org. His token can then see every member's membership, private ones too.
 * 2. With that token, fetch every member's org list in one bulk call - org still listed = stays, missing = left.
 * 3. For members the bulk call can't resolve (renamed login, 100+ orgs), ask the checker one by one over REST.
 *
 * An org that restricts our OAuth app is invisible to every member's token, so there is no in-org checker. We then
 * fall back to any member's token and the public org lists: only public memberships show, and steps 1 and 3 (which
 * need in-org access) are skipped.
 */
export const findLeftMemberships = async (org: Org, context: ApiExtensionContext): Promise<{ left: string[]; orgName: string | null }> => {
	const membersWithToken = org.members.filter(member => member.githubOauthToken);
	const left: OrgMember[] = [];
	let orgChecker: OrgMember | null = null;
	let publicChecker: OrgMember | null = null;

	// 1. Find the checker whose token will read everyone's membership.
	for (const member of membersWithToken) {
		const ownMembership = await getOwnMembership(org, member, context);

		if (ownMembership === 'active') {
			orgChecker = member;
			break;
		}

		// The restriction is org-wide, so no member's token can be active here, but any of them still reads public lists.
		if (ownMembership === 'org-inaccessible') {
			publicChecker = member;
			break;
		}
	}

	const checker = orgChecker ?? publicChecker;

	if (!checker) {
		throw new Error(`Org ${org.name} has no member with a working token, memberships can't be verified.`);
	}

	// 2. Bulk check of all members.
	const { verdicts, orgName } = await getVerdicts(org, org.members, checker.githubOauthToken!, context);

	// The org name only reaches us through a member's login, so a rename can be days old. Everything below reads
	// the org by name, which after a rename may point at a different org, so the run stops and the name is refreshed.
	if (orgName && orgName !== org.name) {
		return { left: [], orgName };
	}

	for (const [ member, verdict ] of verdicts) {
		if (verdict === 'left') {
			left.push(member);
		}

		// 3. One-by-one check of the inconclusive ones - only with an in-org checker, as the REST fallback reads
		//    /orgs/{org}/members, which a restricting org denies. Without one, an inconclusive verdict stays untouched.
		if (verdict === 'unknown' && orgChecker && await hasLeftOrg(org, member, orgChecker, context)) {
			left.push(member);
		}
	}

	return { left: left.map(member => member.membershipId), orgName };
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

const getVerdicts = async (org: Org, members: OrgMember[], token: string, context: ApiExtensionContext): Promise<{ verdicts: Map<OrgMember, Verdict>; orgName: string | null }> => {
	const verdicts = new Map<OrgMember, Verdict>();
	let orgName: string | null = null;
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
			const node = nodes[index] ?? null;
			orgName ??= node?.organizations.nodes.find(orgNode => orgNode?.databaseId.toString() === org.githubId)?.login ?? null;
			verdicts.set(member, getVerdict(org, member, node));
		});
	}

	return { verdicts, orgName };
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
	const fields = logins.map((_login, index) => `u${index}: user(login: $l${index}) { databaseId organizations(first: ${ORGS_LIMIT}) { nodes { databaseId login } } }`).join(' ');
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
