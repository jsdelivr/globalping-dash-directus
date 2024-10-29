import { expect } from 'chai';
import relativeDayUtc from 'relative-day-utc';
import * as sinon from 'sinon';
import operationApi from '../src/api.js';

describe('Remove expired adoptions CRON handler', () => {
	const database = {};
	const getSchema = () => Promise.resolve({});

	const itemsReadByQuery = sinon.stub();
	const notificationsReadByQuery = sinon.stub();
	const deleteByQuery = sinon.stub();
	const createOne = sinon.stub();
	const services = {
		ItemsService: sinon.stub().returns({ readByQuery: itemsReadByQuery, deleteByQuery }),
		NotificationsService: sinon.stub().returns({ createOne, readByQuery: notificationsReadByQuery }),
	};
	const context = { database, getSchema, services } as any;
	let sandbox: sinon.SinonSandbox;

	beforeEach(() => {
		sinon.resetHistory();
		sandbox = sinon.createSandbox({ useFakeTimers: { now: new Date('2023-04-25') } });
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('should notify user if probe is offline for >2 days', async () => {
		itemsReadByQuery.onFirstCall().resolves([{
			id: 'probeId1',
			ip: '1.1.1.1',
			userId: 'userId1',
			status: 'offline',
			lastSyncDate: relativeDayUtc(-2).toISOString().split('T')[0],
		}, {
			id: 'probeId2',
			ip: '1.1.1.1',
			name: 'probe-gb-london-01',
			userId: 'userId1',
			status: 'offline',
			lastSyncDate: relativeDayUtc(-2).toISOString().split('T')[0],
		}]);

		itemsReadByQuery.onSecondCall().resolves([]);

		const result = await operationApi.handler({}, context);

		expect(createOne.callCount).to.equal(2);

		expect(createOne.args[0]).to.deep.equal([
			{
				recipient: 'userId1',
				subject: 'Your probe went offline',
				message: 'Your [probe with IP address **1.1.1.1**](/probes/probeId1) has been offline for more than 24 hours. If it does not come back online before **May 23, 2023** it will be removed from your account.',
				item: 'probeId1',
				collection: 'gp_adopted_probes',
			},
		]);

		expect(createOne.args[1]).to.deep.equal([
			{
				recipient: 'userId1',
				subject: 'Your probe went offline',
				message: 'Your probe [**probe-gb-london-01**](/probes/probeId2) with IP address **1.1.1.1** has been offline for more than 24 hours. If it does not come back online before **May 23, 2023** it will be removed from your account.',
				item: 'probeId2',
				collection: 'gp_adopted_probes',
			},
		]);

		expect(result).to.deep.equal('Removed probes with ids: []. Notified probes with ids: probeId1,probeId2.');
	});

	it('should not notify user if probe is offline for <2 days', async () => {
		itemsReadByQuery.onFirstCall().resolves([{
			id: 'probeId1',
			ip: '1.1.1.1',
			userId: 'userId1',
			status: 'offline',
			lastSyncDate: relativeDayUtc(-1).toISOString().split('T')[0],
		}]);

		itemsReadByQuery.onSecondCall().resolves([]);

		const result = await operationApi.handler({}, context);

		expect(createOne.callCount).to.equal(0);

		expect(result).to.deep.equal('Removed probes with ids: []. Notified probes with ids: [].');
	});

	it('should not create duplicated notifications for the same offline period', async () => {
		itemsReadByQuery.onFirstCall().resolves([{
			id: 'probeId1',
			ip: '1.1.1.1',
			userId: 'userId1',
			status: 'offline',
			lastSyncDate: relativeDayUtc(-3).toISOString(),
		}]);

		itemsReadByQuery.onSecondCall().resolves([{
			recipient: 'userId1',
			item: 'probeId1',
			timestamp: relativeDayUtc(-1).toISOString(),
			collection: 'gp_adopted_probes',
		}]);

		const result = await operationApi.handler({}, context);

		expect(createOne.callCount).to.equal(0);

		expect(result).to.deep.equal('Removed probes with ids: []. Notified probes with ids: [].');
	});

	it('should create notification for the new offline period', async () => {
		itemsReadByQuery.onFirstCall().resolves([{
			id: 'probeId1',
			ip: '1.1.1.1',
			userId: 'userId1',
			status: 'offline',
			lastSyncDate: relativeDayUtc(-2).toISOString(),
		}]);

		itemsReadByQuery.onSecondCall().resolves([{
			recipient: 'userId1',
			item: 'probeId1',
			timestamp: relativeDayUtc(-20).toISOString(),
			collection: 'gp_adopted_probes',
		}]);

		const result = await operationApi.handler({}, context);

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([
			{
				recipient: 'userId1',
				subject: 'Your probe went offline',
				message: 'Your [probe with IP address **1.1.1.1**](/probes/probeId1) has been offline for more than 24 hours. If it does not come back online before **May 23, 2023** it will be removed from your account.',
				item: 'probeId1',
				collection: 'gp_adopted_probes',
			},
		]);

		expect(result).to.deep.equal('Removed probes with ids: []. Notified probes with ids: probeId1.');
	});

	it('should delete adoption if probe is offline for >30 days', async () => {
		itemsReadByQuery.onFirstCall().resolves([{
			id: 'probeId1',
			ip: '1.1.1.1',
			userId: 'userId1',
			status: 'offline',
			lastSyncDate: relativeDayUtc(-30).toISOString().split('T')[0],
		}]);

		itemsReadByQuery.onSecondCall().resolves([]);

		deleteByQuery.resolves([ 'probeId1' ]);

		const result = await operationApi.handler({}, context);

		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]).to.deep.equal([
			{
				recipient: 'userId1',
				subject: 'Your probe has been deleted',
				message: 'Your probe with IP address **1.1.1.1** has been deleted from your account due to being offline for more than 30 days. You can adopt it again when it is back online.',
				item: 'probeId1',
				collection: 'gp_adopted_probes',
			},
		]);

		expect(deleteByQuery.callCount).to.equal(1);

		expect(deleteByQuery.args[0]).to.deep.equal([
			{
				filter: { id: { _in: [ 'probeId1' ] } },
			},
		]);

		expect(result).to.deep.equal('Removed probes with ids: probeId1. Notified probes with ids: [].');
	});

	it('should not delete adoption if probe is offline for <30 days', async () => {
		itemsReadByQuery.onFirstCall().resolves([{
			id: 'probeId1',
			ip: '1.1.1.1',
			userId: 'userId1',
			status: 'offline',
			lastSyncDate: relativeDayUtc(-29).toISOString().split('T')[0],
		}]);

		itemsReadByQuery.onSecondCall().resolves([]);

		await operationApi.handler({}, context);

		expect(deleteByQuery.callCount).to.equal(0);
	});
});
