import { expect } from 'chai';
import * as sinon from 'sinon';
import nock from 'nock';
import { OperationContext } from '@directus/types';
import operationApi from '../src/api.js';

const data = {};
const database = {} as OperationContext['database'];
const accountability = {} as OperationContext['accountability'];
const logger = console.log as unknown as OperationContext['logger'];
const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
const env = {
	GITHUB_WEBHOOK_SECRET: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
	CREDITS_PER_DOLLAR: '10000',
};

const readByQuery = sinon.stub().resolves([{
	id: 1,
	githubLogin: 'monalisa',
	githubId: '2',
	monthlyAmount: 10,
	lastEarningDate: '2023-08-15 08:19:00',
}]);
const createOne = sinon.stub().resolves(1);
const updateOne = sinon.stub().resolves(1);
const deleteOne = sinon.stub().resolves(1);
const services = {
	ItemsService: sinon.stub().returns({ createOne, readByQuery, updateOne, deleteOne }),
};

before(() => {
	nock.disableNetConnect();
	sinon.useFakeTimers(new Date('2023-09-19T00:00:00.000Z'));
});

beforeEach(() => {
	sinon.resetHistory();

	readByQuery.resolves([{
		id: 1,
		githubLogin: 'monalisa',
		githubId: '2',
		monthlyAmount: 10,
		lastEarningDate: '2023-08-15 08:19:00',
	}]);
});

describe('Sponsors cron handler', () => {
	it('should add credits to recurring sponsors with lastEarningDate > 30 days', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: true,
								isOneTimePayment: false,
								tier: {
									monthlyPriceInDollars: 10,
								},
							},
						}],
					},
				},
			},
		});

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(3);

		expect(services.ItemsService.args[0]).deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(updateOne.callCount).to.equal(1);
		expect(updateOne.args[0]).to.deep.equal([ 1, { lastEarningDate: '2023-09-19T00:00:00.000Z' }]);

		expect(services.ItemsService.args[2]).to.deep.equal([ 'credits', {
			schema: {},
			knex: {},
		}]);

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([{
			credits: 100000,
			githubId: '2',
			githubLogin: 'monalisa',
			comment: 'For 10$ recurring sponsorship',
		}]);

		expect(result).to.deep.equal([ 'Credits item with id: 1 for user with github id: 2 created. Recurring sponsorship handled.' ]);
	});

	it('should not add credits to recurring sponsors with lastEarningDate < 30 days', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: true,
								isOneTimePayment: false,
								tier: {
									monthlyPriceInDollars: 10,
								},
							},
						}],
					},
				},
			},
		});

		readByQuery.resolves([{
			id: 1,
			githubLogin: 'monalisa',
			githubId: '2',
			monthlyAmount: 10,
			lastEarningDate: '2023-09-15 08:19:00',
		}]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(1);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);
		expect(updateOne.callCount).to.equal(0);
		expect(createOne.callCount).to.equal(0);
		expect(result).to.deep.equal([]);
	});

	it('should delete sponsor from directus if it is not found on github', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [],
					},
				},
			},
		});

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(2);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(updateOne.callCount).to.equal(0);
		expect(createOne.callCount).to.equal(0);
		expect(deleteOne.callCount).to.equal(1);
		expect(deleteOne.args[0]).to.deep.equal([ 1 ]);
		expect(result).to.deep.equal([ 'Sponsor with github id: 2 not found on github sponsors list. Sponsor deleted from directus.' ]);
	});

	it('should delete sponsor from directus if it is not active', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: false,
								isOneTimePayment: false,
								tier: {
									monthlyPriceInDollars: 10,
								},
							},
						}],
					},
				},
			},
		});

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(2);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(updateOne.callCount).to.equal(0);
		expect(createOne.callCount).to.equal(0);
		expect(deleteOne.callCount).to.equal(1);
		expect(deleteOne.args[0]).to.deep.equal([ 1 ]);
		expect(result).to.deep.equal([ 'Sponsor with github id: 2 is not active on github sponsors list. Sponsor deleted from directus.' ]);
	});

	it('should delete sponsor from directus if his payment is one-time', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: true,
								isOneTimePayment: true,
								tier: {
									monthlyPriceInDollars: 10,
								},
							},
						}],
					},
				},
			},
		});

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(2);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(updateOne.callCount).to.equal(0);
		expect(createOne.callCount).to.equal(0);
		expect(deleteOne.callCount).to.equal(1);
		expect(deleteOne.args[0]).to.deep.equal([ 1 ]);
		expect(result).to.deep.equal([ 'Sponsorship of user with github id: 2 is one-time. Sponsor deleted from directus.' ]);
	});

	it('should update directus "monthlyAmount" field if github and directus fields do not match', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: true,
								isOneTimePayment: false,
								tier: {
									monthlyPriceInDollars: 15,
								},
							},
						}],
					},
				},
			},
		});

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(4);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(services.ItemsService.args[2]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(updateOne.callCount).to.equal(2);
		expect(updateOne.args[0]).to.deep.equal([ 1, { monthlyAmount: 15 }]);
		expect(updateOne.args[1]).to.deep.equal([ 1, { lastEarningDate: '2023-09-19T00:00:00.000Z' }]);

		expect(services.ItemsService.args[3]).to.deep.equal([ 'credits', {
			schema: {},
			knex: {},
		}]);

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([{
			credits: 150000,
			githubId: '2',
			githubLogin: 'monalisa',
			comment: 'For 15$ recurring sponsorship',
		}]);

		expect(result).to.deep.equal([ 'Credits item with id: 1 for user with github id: 2 created. Recurring sponsorship handled.' ]);
	});

	it('should add missing recurring sponsors to the directus', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: true,
								isOneTimePayment: false,
								tier: {
									monthlyPriceInDollars: 10,
								},
							},
						}],
					},
				},
			},
		});

		readByQuery.resolves([]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(2);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);

		expect(services.ItemsService.args[1]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([{
			githubId: '2',
			githubLogin: 'monalisa',
			lastEarningDate: '2023-09-19T00:00:00.000Z',
			monthlyAmount: 10,
		}]);

		expect(result).to.deep.equal([ 'Sponsor with github id: 2 not found on directus sponsors list. Sponsor added to directus.' ]);
	});

	it('should not add non-recurring sponsors to the directus', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: true,
								isOneTimePayment: true,
								tier: {
									monthlyPriceInDollars: 10,
								},
							},
						}],
					},
				},
			},
		});

		readByQuery.resolves([]);

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(services.ItemsService.callCount).to.equal(1);

		expect(services.ItemsService.args[0]).to.deep.equal([ 'sponsors', {
			schema: {},
			knex: {},
		}]);

		expect(readByQuery.callCount).to.equal(1);
		expect(readByQuery.args[0]).to.deep.equal([{}]);
		expect(createOne.callCount).to.equal(0);
		expect(result).to.deep.equal([]);
	});

	it('should handle multiple sponsors and return results for each', async () => {
		nock('https://api.github.com').post('/graphql').reply(200, {
			data: {
				organization: {
					sponsorshipsAsMaintainer: {
						pageInfo: {
							hasNextPage: false,
							endCursor: 'NQ',
						},
						edges: [{
							node: {
								sponsorEntity: {
									login: 'monalisa',
									databaseId: 2,
								},
								isActive: true,
								isOneTimePayment: false,
								tier: {
									monthlyPriceInDollars: 10,
								},
							},
						}, {
							node: {
								sponsorEntity: {
									login: 'vangogh',
									databaseId: 3,
								},
								isActive: true,
								isOneTimePayment: false,
								tier: {
									monthlyPriceInDollars: 3,
								},
							},
						}],
					},
				},
			},
		});

		const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([
			'Credits item with id: 1 for user with github id: 2 created. Recurring sponsorship handled.',
			'Sponsor with github id: 3 not found on directus sponsors list. Sponsor added to directus.',
		]);
	});
});
