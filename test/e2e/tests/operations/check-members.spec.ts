import { test, expect } from '../../fixtures.ts';
import { client as sql } from '../../client.ts';
import { User } from '../../types.ts';
import { GithubOrg, createOrgToken, getSelectedOrgs, membership, prepareMockGithub, selectOrgs } from '../../github.ts';
import { loginUser } from '../../utils.ts';
import { FLOW, trigger } from './shared.ts';

// `login` is what GitHub answers with: passing an older one makes the stored login stale, as it is after a rename.
const prepareMockMember = async (user: User, orgs: GithubOrg[], login?: string, restrictedOrgs: string[] = []) => {
	// The bulk check resolves a member by their stored login, and the generated logins repeat between tests while the states live on.
	user.github_username = `${user.github_username}-${user.external_identifier}`;
	await sql('directus_users').where({ id: user.id }).update({ github_username: user.github_username });

	await prepareMockGithub(user, orgs.map(org => membership(org.id, org.login)), [], login ?? user.github_username, restrictedOrgs);
};

test('the members cron removes the memberships of everyone who left, with their org tokens and selection', async ({ org }) => {
	const githubOrg = { id: Number(org.github_id), login: org.name };
	const [ adminApi, memberApi ] = await Promise.all([ loginUser(org.admin), loginUser(org.member) ]);
	const [ adminToken, memberToken ] = await Promise.all([ createOrgToken(adminApi, org.account_id), createOrgToken(memberApi, org.account_id) ]);

	await Promise.all([
		prepareMockMember(org.admin, [ githubOrg ]),
		prepareMockMember(org.viewer, [ githubOrg ]),
		// The member is in some other org now, but not in this one.
		prepareMockMember(org.member, [{ id: 1, login: 'e2e-some-other-org' }]),
		selectOrgs(org.member, [ org.id ]),
		selectOrgs(org.viewer, [ org.id ]),
	]);

	await trigger(FLOW.checkMembers);

	const memberships = await sql('gp_org_members').where({ org: org.id }).select('user');
	expect(memberships.map(item => item.user).sort()).toEqual([ org.admin.id, org.viewer.id ].sort());

	// The org the user is no longer in can not stay in the list the dashboard switcher is built from.
	expect(await getSelectedOrgs(org.member)).toEqual([]);
	expect(await getSelectedOrgs(org.viewer)).toEqual([ org.id ]);

	// The leaver's org tokens are removed by a database trigger; the admin's token and the org itself stay.
	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeUndefined();
	expect(await sql('gp_tokens').where({ id: adminToken }).first('id')).toBeTruthy();
	expect(await sql('gp_orgs').where({ id: org.id }).first('id')).toBeTruthy();
});

/*
 * A member who renamed themselves on GitHub must not be taken for a leaver: the cron would delete their membership, and the
 * database trigger their org tokens and approvals with it. The cron gets there in three steps:
 * 1. it finds a checker - a member whose own token confirms they are still in the org (the admin here);
 * 2. with the checker's token it asks GitHub about every member at once, by the login stored in our database. The renamed
 *    member's stored login resolves to nobody, so the answer is "unknown", not "left" - while the viewer's list simply has no
 *    such org, which is conclusive;
 * 3. everyone left unknown is asked about with their own token, which answers without a login at all.
 */
test('the members cron does not take a member who renamed themselves on GitHub for a leaver', async ({ org }) => {
	const githubOrg = { id: Number(org.github_id), login: org.name };
	const [ adminApi, memberApi ] = await Promise.all([ loginUser(org.admin), loginUser(org.member) ]);
	const [ adminToken, memberToken ] = await Promise.all([ createOrgToken(adminApi, org.account_id), createOrgToken(memberApi, org.account_id) ]);

	await Promise.all([
		prepareMockMember(org.admin, [ githubOrg ]),
		// GitHub knows them under the new login, our database still under the old one.
		prepareMockMember(org.member, [ githubOrg ], 'e2e-renamed-login'),
		// The viewer really did leave: proof that the run checked everyone instead of quietly doing nothing.
		prepareMockMember(org.viewer, [{ id: 1, login: 'e2e-some-other-org' }]),
		selectOrgs(org.member, [ org.id ]),
		selectOrgs(org.viewer, [ org.id ]),
	]);

	await trigger(FLOW.checkMembers);

	const memberships = await sql('gp_org_members').where({ org: org.id }).select('user');
	expect(memberships.map(item => item.user).sort()).toEqual([ org.admin.id, org.member.id ].sort());

	// The renamed member keeps everything; only the viewer is treated as gone.
	expect(await getSelectedOrgs(org.member)).toEqual([ org.id ]);
	expect(await getSelectedOrgs(org.viewer)).toEqual([]);
	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeTruthy();
	expect(await sql('gp_tokens').where({ id: adminToken }).first('id')).toBeTruthy();
});

test('the members cron refreshes the stored org name instead of checking the org by it', async ({ org }) => {
	const newLogin = `${org.name}-renamed`;
	// Someone else holds the name we still have stored.
	const squatter = { id: 1, login: org.name };
	const renamed = { id: Number(org.github_id), login: newLogin };
	const memberApi = await loginUser(org.member);
	const memberToken = await createOrgToken(memberApi, org.account_id);

	await Promise.all([
		// The admin is in both, so the stale name still finds a checker and the run gets as far as the bulk check.
		prepareMockMember(org.admin, [ squatter, renamed ]),
		prepareMockMember(org.viewer, [ renamed ]),
		// Really out of the org, but nothing may be removed until the name is verified.
		prepareMockMember(org.member, [{ id: 2, login: 'e2e-some-other-org' }]),
		selectOrgs(org.member, [ org.id ]),
	]);

	await trigger(FLOW.checkMembers);

	expect(await sql('gp_orgs').where({ id: org.id }).first('name')).toMatchObject({ name: newLogin });

	const memberships = await sql('gp_org_members').where({ org: org.id }).select('user');
	expect(memberships.map(item => item.user).sort()).toEqual([ org.admin.id, org.member.id, org.viewer.id ].sort());
	expect(await getSelectedOrgs(org.member)).toEqual([ org.id ]);
	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeTruthy();
});

/*
 * An org that restricts our OAuth app answers 403 to every member's own membership check, so no member can be the
 * in-org checker. The cron must not give up on it - it falls back to the public org lists and still removes leavers.
 * Every member is publicly in the org (that is the only way our sync learns of a restricted org), so a leaver is one
 * whose public org list no longer has it.
 */
test('the members cron cleans up a leaver of an org that restricts the OAuth app', async ({ org }) => {
	const githubOrg = { id: Number(org.github_id), login: org.name };
	const [ adminApi, memberApi ] = await Promise.all([ loginUser(org.admin), loginUser(org.member) ]);
	const [ adminToken, memberToken ] = await Promise.all([ createOrgToken(adminApi, org.account_id), createOrgToken(memberApi, org.account_id) ]);

	await Promise.all([
		prepareMockMember(org.admin, [ githubOrg ], undefined, [ org.name ]),
		prepareMockMember(org.viewer, [ githubOrg ], undefined, [ org.name ]),
		// Publicly in another org now, but no longer in this one.
		prepareMockMember(org.member, [{ id: 1, login: 'e2e-some-other-org' }], undefined, [ org.name ]),
		selectOrgs(org.member, [ org.id ]),
		selectOrgs(org.viewer, [ org.id ]),
	]);

	await trigger(FLOW.checkMembers);

	const memberships = await sql('gp_org_members').where({ org: org.id }).select('user');
	expect(memberships.map(item => item.user).sort()).toEqual([ org.admin.id, org.viewer.id ].sort());

	expect(await getSelectedOrgs(org.member)).toEqual([]);
	expect(await getSelectedOrgs(org.viewer)).toEqual([ org.id ]);
	expect(await sql('gp_tokens').where({ id: memberToken }).first('id')).toBeUndefined();
	expect(await sql('gp_tokens').where({ id: adminToken }).first('id')).toBeTruthy();
});
