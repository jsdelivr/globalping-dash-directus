import { expect } from 'chai';
import type { Knex } from 'knex';
import * as sinon from 'sinon';
import { transferProbes } from '../src/actions/transfer-probes.js';

describe('transfer probes', () => {
	const TRANSFER = {
		userId: 'user-1',
		userAccountId: 'user-account',
		userGithubId: 'gh-user',
		orgId: 'org-1',
		orgAccountId: 'org-account',
		orgGithubId: 'gh-org',
	};

	let movedProbes = 1;
	let user: object = { adoption_token: 'old-token', github_username: 'alice' };
	const updates: Record<string, object[]> = {};
	const raw = sinon.stub().resolves();

	const trx = Object.assign((table: string) => {
		const builder: Record<string, unknown> = {
			where: () => builder,
			first: () => Promise.resolve(user),
			update: (fields: object) => {
				(updates[table] ??= []).push(fields);
				return Promise.resolve(table === 'gp_probes' ? movedProbes : 1);
			},
		};

		return builder;
	}, { raw }) as unknown as Knex.Transaction;

	beforeEach(() => {
		sinon.resetHistory();
		movedProbes = 1;
		user = { adoption_token: 'old-token', github_username: 'alice' };
		Object.keys(updates).forEach(table => delete updates[table]);
	});

	it('should move the probes, add the user adoption token to the org and generate a new token for the user', async () => {
		await transferProbes(TRANSFER, trx);

		expect(updates.gp_probes).to.deep.equal([{ account_id: 'org-account' }]);
		expect(raw.firstCall.args[1]).to.deep.equal({ username: 'alice', token: 'old-token', org: 'org-1' });
		expect((updates.directus_users?.[0] as { adoption_token: string }).adoption_token).to.have.length(32);
		expect((updates.directus_users?.[0] as { adoption_token: string }).adoption_token).to.not.equal('old-token');
	});

	it('should not change any token when the user has no probes', async () => {
		movedProbes = 0;

		await transferProbes(TRANSFER, trx);

		expect(updates.gp_probes).to.have.length(1);
		expect(raw.callCount).to.equal(0);
		expect(updates.directus_users).to.equal(undefined);
	});
});
