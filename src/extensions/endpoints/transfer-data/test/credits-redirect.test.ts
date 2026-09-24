import type { EndpointExtensionContext } from '@directus/extensions';
import { expect } from 'chai';
import { getRedirects } from '../src/actions/credits-redirect.js';

describe('credits redirect', () => {
	const rows: Record<string, object[]> = {};
	const context = {
		database: (table: string) => {
			const builder = {
				where: () => builder,
				orWhere: () => builder,
				whereIn: () => builder,
				select: () => Promise.resolve(rows[table] ?? []),
			};

			return builder;
		},
	} as unknown as EndpointExtensionContext;

	beforeEach(() => {
		rows.gp_credits_redirects = [];
		rows.directus_users = [];
		rows.gp_orgs = [];
	});

	it('should return the name of the user and the name of the org', async () => {
		rows.gp_credits_redirects = [{ source_github_id: '1', target_github_id: '2' }];
		rows.directus_users = [{ external_identifier: '1', github_username: 'alice' }];
		rows.gp_orgs = [{ github_id: '2', name: 'acme' }];

		expect(await getRedirects('1', context)).to.deep.equal([{
			source: { githubId: '1', name: 'alice' },
			target: { githubId: '2', name: 'acme' },
		}]);
	});

	it('should return the github id as the name when it is not a known user or org', async () => {
		rows.gp_credits_redirects = [{ source_github_id: '1', target_github_id: '999' }];
		rows.directus_users = [{ external_identifier: '1', github_username: 'alice' }];

		expect(await getRedirects('1', context)).to.deep.equal([{
			source: { githubId: '1', name: 'alice' },
			target: { githubId: '999', name: '999' },
		}]);
	});

	it('should return an empty list when there are no redirects', async () => {
		expect(await getRedirects('1', context)).to.deep.equal([]);
	});
});
