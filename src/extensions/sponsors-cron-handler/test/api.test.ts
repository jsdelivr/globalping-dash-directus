import axios from 'axios';
import { test, expect, mock, beforeEach, beforeAll, setSystemTime } from 'bun:test';
import MockAdapter from 'axios-mock-adapter';
import { OperationContext } from '@directus/types';
import operationApi from '../src/api.js';

const axiosMock = new MockAdapter(axios);

const data = {};
const database = {} as OperationContext['database'];
const accountability = {} as OperationContext['accountability'];
const logger = (() => {}) as unknown as OperationContext['logger'];
const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
const env = {
	GITHUB_WEBHOOK_TOKEN: '77a9a254554d458f5025bb38ad1648a3bb5795e8',
	CREDITS_PER_DOLLAR: '10000'
};

const readByQuery = mock();
const createOne = mock(() => Promise.resolve(1));
const updateOne = mock(() => Promise.resolve(1));
const deleteOne = mock(() => Promise.resolve(1));
const services = {
	ItemsService: mock(function () { return { createOne, readByQuery, updateOne, deleteOne }}),
};

beforeAll(() => {
	setSystemTime(new Date('2023-09-19T00:00:00.000Z'));
});

beforeEach(() => {
	services.ItemsService.mockClear();
	readByQuery.mockClear().mockResolvedValue([{
		id: 1,
		githubLogin: 'monalisa',
		githubId: '2',
		monthlyAmount: 10,
		lastEarningDate: '2023-08-15 08:19:00',
	}]);
	createOne.mockClear();
	updateOne.mockClear();
	deleteOne.mockClear();
});

test('sponsors-cron-handler should add credits to recurring sponsors with lastEarningDate > 30 days', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: true,
							isOneTimePayment: false,
							tier: {
								monthlyPriceInDollars: 10
							}
						}
					}]
				}
			}
		}
	});

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(3);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(updateOne).toHaveBeenCalledTimes(1);
	expect(updateOne.mock.calls[0]).toEqual([1, { lastEarningDate: '2023-09-19T00:00:00.000Z' }]);
	expect(services.ItemsService.mock.calls[2]).toEqual([ 'credits', {
		schema: {},
		knex: {}
	}]);
	expect(createOne).toHaveBeenCalledTimes(1);
	expect(createOne.mock.calls[0]).toEqual([{
		credits: 100000,
		githubId: '2',
		githubLogin: 'monalisa',
		comment: 'For 10$ recurring sponsorship'
	}]);
	expect(result).toEqual(['Credits item with id: 1 for user with github id: 2 created. Recurring sponsorship handled.']);
});

test('sponsors-cron-handler should not add credits to recurring sponsors with lastEarningDate < 30 days', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: true,
							isOneTimePayment: false,
							tier: {
								monthlyPriceInDollars: 10
							}
						}
					}]
				}
			}
		}
	});
	readByQuery.mockResolvedValue([{
		id: 1,
		githubLogin: 'monalisa',
		githubId: '2',
		monthlyAmount: 10,
		lastEarningDate: '2023-09-15 08:19:00',
	}]);

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(1);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(updateOne).toHaveBeenCalledTimes(0);
	expect(createOne).toHaveBeenCalledTimes(0);
	expect(result).toEqual([]);
});

test('sponsors-cron-handler should delete sponsor from directus if it is not found on github', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: []
				}
			}
		}
	});

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(2);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(updateOne).toHaveBeenCalledTimes(0);
	expect(createOne).toHaveBeenCalledTimes(0);
	expect(deleteOne).toHaveBeenCalledTimes(1);
	expect(deleteOne.mock.calls[0]).toEqual([ 1 ]);
	expect(result).toEqual(['Sponsor with github id: 2 not found on github sponsors list. Sponsor deleted from directus.']);
});

test('sponsors-cron-handler should delete sponsor from directus if it is not active', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: false,
							isOneTimePayment: false,
							tier: {
								monthlyPriceInDollars: 10
							}
						}
					}]
				}
			}
		}
	});

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(2);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(updateOne).toHaveBeenCalledTimes(0);
	expect(createOne).toHaveBeenCalledTimes(0);
	expect(deleteOne).toHaveBeenCalledTimes(1);
	expect(deleteOne.mock.calls[0]).toEqual([ 1 ]);
	expect(result).toEqual(['Sponsor with github id: 2 is not active on github sponsors list. Sponsor deleted from directus.']);
});

test('sponsors-cron-handler should delete sponsor from directus if his payment is one-time', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: true,
							isOneTimePayment: true,
							tier: {
								monthlyPriceInDollars: 10
							}
						}
					}]
				}
			}
		}
	});

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(2);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(updateOne).toHaveBeenCalledTimes(0);
	expect(createOne).toHaveBeenCalledTimes(0);
	expect(deleteOne).toHaveBeenCalledTimes(1);
	expect(deleteOne.mock.calls[0]).toEqual([ 1 ]);
	expect(result).toEqual(['Sponsorship of user with github id: 2 is one-time. Sponsor deleted from directus.']);
});

test('sponsors-cron-handler should update directus "monthlyAmount" field if github and directus fields do not match', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: true,
							isOneTimePayment: false,
							tier: {
								monthlyPriceInDollars: 15
							}
						}
					}]
				}
			}
		}
	});

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(4);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(services.ItemsService.mock.calls[2]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(updateOne).toHaveBeenCalledTimes(2);
	expect(updateOne.mock.calls[0]).toEqual([1, { monthlyAmount: 15 }]);
	expect(updateOne.mock.calls[1]).toEqual([1, { lastEarningDate: '2023-09-19T00:00:00.000Z' }]);
	expect(services.ItemsService.mock.calls[3]).toEqual([ 'credits', {
		schema: {},
		knex: {}
	}]);
	expect(createOne).toHaveBeenCalledTimes(1);
	expect(createOne.mock.calls[0]).toEqual([{
		credits: 150000,
		githubId: '2',
		githubLogin: 'monalisa',
		comment: 'For 15$ recurring sponsorship'
	}]);
	expect(result).toEqual(['Credits item with id: 1 for user with github id: 2 created. Recurring sponsorship handled.']);
});

test('sponsors-cron-handler should add missing recurring sponsors to the directus', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: true,
							isOneTimePayment: false,
							tier: {
								monthlyPriceInDollars: 10
							}
						}
					}]
				}
			}
		}
	});
	readByQuery.mockClear().mockResolvedValue([]);

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(2);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(services.ItemsService.mock.calls[1]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(createOne).toHaveBeenCalledTimes(1);
	expect(createOne.mock.calls[0]).toEqual([{
		githubId: '2',
		githubLogin: 'monalisa',
		lastEarningDate: '2023-09-19T00:00:00.000Z',
		monthlyAmount: 10
	}]);
	expect(result).toEqual(['Sponsor with github id: 2 not found on directus sponsors list. Sponsor added to directus.']);
});

test('sponsors-cron-handler should not add non-recurring sponsors to the directus', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: true,
							isOneTimePayment: true,
							tier: {
								monthlyPriceInDollars: 10
							}
						}
					}]
				}
			}
		}
	});
	readByQuery.mockClear().mockResolvedValue([]);

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(services.ItemsService).toHaveBeenCalledTimes(1);
	expect(services.ItemsService.mock.calls[0]).toEqual([ 'sponsors', {
		schema: {},
		knex: {}
	}]);
	expect(readByQuery).toHaveBeenCalledTimes(1);
	expect(readByQuery.mock.calls[0]).toEqual([{}]);
	expect(createOne).toHaveBeenCalledTimes(0);
	expect(result).toEqual([]);
});

test('sponsors-cron-handler should handle multiple sponsors and return results for each', async () => {
	axiosMock.onPost('https://api.github.com/graphql').reply(200, {
		data: {
			organization: {
				sponsorshipsAsMaintainer: {
					pageInfo: {
						hasNextPage: false,
						endCursor: 'NQ'
					},
					edges: [{
						node: {
							sponsorEntity: {
								login: 'monalisa',
								databaseId: 2
							},
							isActive: true,
							isOneTimePayment: false,
							tier: {
								monthlyPriceInDollars: 10
							}
						}
					}, {
						node: {
							sponsorEntity: {
								login: 'vangogh',
								databaseId: 3
							},
							isActive: true,
							isOneTimePayment: false,
							tier: {
								monthlyPriceInDollars: 3
							}
						}
					}]
				}
			}
		}
	});

	const result = await operationApi.handler({}, { data, database, env, getSchema, services, logger, accountability });

	expect(result).toEqual([
		'Credits item with id: 1 for user with github id: 2 created. Recurring sponsorship handled.',
		'Sponsor with github id: 3 not found on directus sponsors list. Sponsor added to directus.'
	]);
});
