import { expect } from 'chai';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
import { authorize } from '../src/actions/authorize.js';

describe('authorize', () => {
	const ORG = 'org-1';
	const USER = 'user-1';

	let org: object | undefined;
	let membership: object | undefined;
	let admin: object | undefined;
	const update = sinon.stub().resolves(1);

	const trx = ((table: string) => {
		const filters: Record<string, unknown>[] = [];
		const builder: Record<string, unknown> = { update };

		[ 'where', 'join', 'whereIn' ].forEach((method) => {
			builder[method] = (filter: Record<string, unknown>) => {
				filters.push(filter);
				return builder;
			};
		});

		builder.first = () => {
			if (table === 'gp_orgs') { return Promise.resolve(org); }

			if (table === 'gp_accounts') { return Promise.resolve({ id: 'org-account' }); }

			if (table === 'directus_users') { return Promise.resolve({ account_id: 'user-account', github_id: 'gh-user' }); }

			return Promise.resolve(filters.some(filter => filter.role === 'admin') ? admin : membership);
		};

		return builder;
	}) as unknown as Knex.Transaction;

	beforeEach(() => {
		sinon.resetHistory();
		org = { github_id: 'gh-org' };
		membership = { role: 'member' };
		admin = undefined;
	});

	const rejection = async (operation: 'probes' | 'credits') => {
		const error = await authorize(ORG, USER, operation, trx).catch(err => err);
		return { message: (error as Error).message, status: (error as { status: number }).status };
	};

	it('should return the ids and accounts of the user and the org', async () => {
		expect(await authorize(ORG, USER, 'credits', trx)).to.deep.equal({
			userId: USER,
			userAccountId: 'user-account',
			userGithubId: 'gh-user',
			orgId: ORG,
			orgAccountId: 'org-account',
			orgGithubId: 'gh-org',
		});
	});

	it('should reject when the org does not exist', async () => {
		org = undefined;

		expect(await rejection('credits')).to.deep.equal({ message: 'Organization not found.', status: 400 });
	});

	it('should reject a user who is not a member of the org', async () => {
		membership = undefined;

		expect(await rejection('credits')).to.deep.equal({ message: 'You are not a member of this organization.', status: 403 });
	});

	it('should reject a viewer for probes and for credits', async () => {
		membership = { role: 'viewer' };

		expect(await rejection('credits')).to.deep.equal({ message: 'Viewers can not transfer anything to an organization.', status: 403 });
		expect(await rejection('probes')).to.deep.equal({ message: 'Viewers can not transfer anything to an organization.', status: 403 });
		expect(update.callCount).to.equal(0);
	});

	it('should reject probes from a member when the org already has an admin', async () => {
		admin = { id: 'somebody-else' };

		expect(await rejection('probes')).to.deep.equal({
			message: 'Probes can only be moved into an organization that has no admin yet.',
			status: 403,
		});
	});

	it('should allow credits from a member when the org already has an admin, and not make them an admin', async () => {
		admin = { id: 'somebody-else' };

		await authorize(ORG, USER, 'credits', trx);

		expect(update.callCount).to.equal(0);
	});

	it('should allow probes from an admin when the org already has an admin', async () => {
		admin = { id: 'somebody-else' };
		membership = { role: 'admin' };

		await authorize(ORG, USER, 'probes', trx);

		expect(update.callCount).to.equal(0);
	});

	it('should make the user an admin when the org has no admin', async () => {
		await authorize(ORG, USER, 'credits', trx);

		expect(update.args[0]).to.deep.equal([{ role: 'admin' }]);
	});
});
