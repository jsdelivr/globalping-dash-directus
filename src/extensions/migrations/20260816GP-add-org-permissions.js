import { getUserPermissions, editPermissions, getUserPolicyId, createPermissions } from '../migration-utils/permissions.js';

const MY_ACCOUNTS = {
	_or: [
		{ account_id: { _in: '$CURRENT_USER.account.id' } },
		{ account_id: { _in: '$CURRENT_USER.memberships.org.account.id' } },
	],
};

const MINE_OR_ADMIN = {
	_or: [
		{ account_id: { user: { _eq: '$CURRENT_USER' } } },
		{ account_id: { org: { members: { user: { _eq: '$CURRENT_USER' }, role: { _eq: 'admin' } } } } },
	],
};

const ORG_ADMIN = { org: { members: { user: { _eq: '$CURRENT_USER' }, role: { _eq: 'admin' } } } };

export async function up () {
	const probes = await getUserPermissions('gp_probes');
	probes.readPermissions.permissions = MY_ACCOUNTS;
	await editPermissions(probes.readPermissions, [ 'account_id' ]);
	probes.updatePermissions.permissions = MINE_OR_ADMIN;
	probes.updatePermissions.validation = { _and: [{ userId: { _null: true } }, { account_id: { _null: true } }] };
	await editPermissions(probes.updatePermissions, [ 'account_id' ]);
	console.log('gp_probes permissions updated');

	const tokens = await getUserPermissions('gp_tokens');
	await editPermissions(tokens.createPermissions, [ 'account_id' ]);
	console.log('gp_tokens create fields updated');

	const credits = await getUserPermissions('gp_credits');
	credits.readPermissions.permissions = MY_ACCOUNTS;
	await editPermissions(credits.readPermissions, [ 'account_id' ]);

	const deductions = await getUserPermissions('gp_credits_deductions');
	deductions.readPermissions.permissions = MY_ACCOUNTS;
	await editPermissions(deductions.readPermissions, [ 'account_id' ]);

	const additions = await getUserPermissions('gp_credits_additions');

	additions.readPermissions.permissions = {
		_or: [
			{ github_id: { _eq: '$CURRENT_USER.external_identifier' } },
			{ github_id: { _in: '$CURRENT_USER.memberships.org.github_id' } },
		],
	};

	await editPermissions(additions.readPermissions);
	console.log('gp_credits* permissions updated');

	const policyId = await getUserPolicyId();

	const orgPermissions = [
		{
			collection: 'gp_orgs',
			action: 'read',
			policy: policyId,
			permissions: { members: { user: { _eq: '$CURRENT_USER' } } },
			fields: [ 'id', 'name', 'github_id', 'account', 'members' ],
		},
		{
			collection: 'gp_orgs',
			action: 'update',
			policy: policyId,
			permissions: { members: { user: { _eq: '$CURRENT_USER' }, role: { _eq: 'admin' } } },
			fields: [ 'adoption_token' ],
		},
		{
			collection: 'gp_org_members',
			action: 'read',
			policy: policyId,
			permissions: { _or: [{ user: { _eq: '$CURRENT_USER' } }, ORG_ADMIN ] },
			fields: [ 'id', 'org', 'user', 'role', 'notification_preferences' ],
		},
		{
			collection: 'gp_org_members',
			action: 'update',
			policy: policyId,
			permissions: { _or: [{ user: { _eq: '$CURRENT_USER' } }, ORG_ADMIN ] },
			fields: [ 'role', 'notification_preferences' ],
		},
	];

	const orgs = await getUserPermissions('gp_orgs');
	const members = await getUserPermissions('gp_org_members');

	if (orgs.readPermissions || orgs.updatePermissions || members.readPermissions || members.updatePermissions) {
		throw new Error('gp_orgs/gp_org_members permissions already exist.');
	}

	await createPermissions(orgPermissions);
	console.log('gp_orgs and gp_org_members permissions created');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}
