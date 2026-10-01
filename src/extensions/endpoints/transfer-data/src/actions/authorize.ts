import { createError } from '@directus/errors';
import type { Knex } from 'knex';
import type { Operation, Transfer } from '../types.js';

const OrgNotFoundError = createError('INVALID_PAYLOAD_ERROR', 'Organization not found.', 400);
const NotAMemberError = createError('FORBIDDEN', 'You are not a member of this organization.', 403);
const ViewerError = createError('FORBIDDEN', 'Viewers can not transfer anything to an organization.', 403);
const OrgHasAdminError = createError('FORBIDDEN', 'Probes can only be moved into an organization that has no admin yet.', 403);

export const authorize = async (orgId: string, userId: string, operation: Operation, trx: Knex.Transaction): Promise<Transfer> => {
	const org = await trx('gp_orgs').where({ id: orgId }).first<{ github_id: string } | undefined>('github_id');

	if (!org) {
		throw new OrgNotFoundError();
	}

	const membership = await trx('gp_org_members').where({ org: orgId, user: userId }).first<{ role: string } | undefined>('role');

	if (!membership) {
		throw new NotAMemberError();
	}

	if (membership.role === 'viewer') {
		throw new ViewerError();
	}

	const [ user, orgAccount, admin ] = await Promise.all([
		trx('directus_users')
			.join('gp_accounts', 'gp_accounts.user', 'directus_users.id')
			.where({ 'directus_users.id': userId })
			.first<{ account_id: string; github_id: string | null }>('gp_accounts.id as account_id', 'directus_users.external_identifier as github_id'),
		trx('gp_accounts').where({ org: orgId }).first<{ id: string }>('id'),
		trx('gp_org_members').where({ org: orgId, role: 'admin' }).first<{ id: string } | undefined>('id'),
	]);

	// Probes transfer is avalable for admins and for members if there are no admins.
	// Tokens transfer is avaliable for admins and members.
	// Credits transfer is avaliable for admins and members.
	if (admin && membership.role !== 'admin' && operation === 'probes') {
		throw new OrgHasAdminError();
	}

	// The first member to move anything into an org nobody runs becomes its admin.
	if (!admin) {
		await trx('gp_org_members').where({ org: orgId, user: userId }).update({ role: 'admin' });
	}

	return {
		userId,
		userAccountId: user.account_id,
		userGithubId: user.github_id,
		orgId,
		orgAccountId: orgAccount.id,
		orgGithubId: org.github_id,
	};
};
