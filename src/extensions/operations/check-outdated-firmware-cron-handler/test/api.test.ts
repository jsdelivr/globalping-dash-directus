import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { checkOutdatedFirmware } from '../src/actions/check-outdated-firmware.js';

describe('Adopted probes status cron handler', () => {
	const sqlIds = {
		distinct: sinon.stub(),
		whereRaw: sinon.stub(),
		orderBy: sinon.stub(),
	};
	sqlIds.distinct.returns(sqlIds);
	sqlIds.whereRaw.returns(sqlIds);

	const sqlProbes = {
		select: sinon.stub(),
		whereRaw: sinon.stub(),
		where: sinon.stub(),
		orderBy: sinon.stub(),
	};
	sqlProbes.select.returns(sqlProbes);
	sqlProbes.whereRaw.returns(sqlProbes);
	sqlProbes.where.returns(sqlProbes);

	const database = sinon.stub() as any;
	const accountability = {} as OperationContext['accountability'];
	const logger = console.log as unknown as OperationContext['logger'];
	const getSchema = (() => Promise.resolve({})) as OperationContext['getSchema'];
	const env = {
		TARGET_NODE_VERSION: 'v20.13.0',
		TARGET_HW_DEVICE_FIRMWARE: 'v2.0',
	};

	const data = {};
	const readByQuery = sinon.stub().resolves([]);
	const createOne = sinon.stub();
	const services = {
		ItemsService: sinon.stub().returns({ readByQuery }),
		NotificationsService: sinon.stub().returns({ createOne }),
	} as unknown as OperationContext['services'];

	const mockProbesResult = (probes: any[]) => {
		sqlProbes.orderBy.resetBehavior();
		sqlProbes.orderBy.resolves(probes);
	};

	beforeEach(() => {
		readByQuery.resolves([]);
		database.reset();
		sqlIds.orderBy.resetBehavior();
		sqlIds.orderBy.resolves([{ userId: 'user-id' }]);
		mockProbesResult([]);
		database.onFirstCall().returns(sqlIds);
		database.onSecondCall().returns(sqlProbes);
		sinon.resetHistory();
	});

	it('should send notification about outdated firmware', async () => {
		mockProbesResult([{
			id: 'probe-id',
			ip: '1.1.1.1',
			userId: 'user-id',
			hardwareDevice: 'v1',
			hardwareDeviceFirmware: 'v1.9',
			isOutdated: true,
			nodeVersion: 'v20.13.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([ 'probe-id' ]);

		expect(createOne.args[0]?.[0]).to.deep.equal({
			recipient: 'user-id',
			item: 'probe-id',
			collection: 'gp_probes',
			type: 'outdated_firmware',
			secondary_type: 'v2.0_v20.13.0',
			subject: 'Your hardware probe is running an outdated firmware',
			message: 'Your [probe with IP address **1.1.1.1**](/probes/probe-id) is running an outdated firmware and we couldn\'t update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.',
		});
	});

	it('should send notification about outdated node.js', async () => {
		mockProbesResult([{
			id: 'probe-id',
			ip: '1.1.1.1',
			userId: 'user-id',
			hardwareDevice: null,
			hardwareDeviceFirmware: null,
			isOutdated: true,
			nodeVersion: 'v20.12.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([ 'probe-id' ]);

		expect(createOne.args[0]?.[0]).to.deep.equal({
			recipient: 'user-id',
			item: 'probe-id',
			collection: 'gp_probes',
			type: 'outdated_software',
			secondary_type: 'v20.13.0',
			subject: 'Your probe container is running an outdated software version',
			message: 'Your [probe with IP address **1.1.1.1**](/probes/probe-id) is running an outdated software version and we couldn\'t update it automatically. Please follow [our guide](/probes?view=update-a-probe) to update it manually.',
		});
	});

	it('should escape markdown in probe name', async () => {
		mockProbesResult([{
			id: 'probe-id',
			ip: '1.1.1.1',
			name: '][not the probe](https://another.link)[probe',
			userId: 'user-id',
			hardwareDevice: null,
			hardwareDeviceFirmware: null,
			isOutdated: true,
			nodeVersion: 'v20.12.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([ 'probe-id' ]);

		expect(createOne.args[0]?.[0]).to.deep.equal({
			recipient: 'user-id',
			item: 'probe-id',
			collection: 'gp_probes',
			type: 'outdated_software',
			secondary_type: 'v20.13.0',
			subject: 'Your probe container is running an outdated software version',
			message: 'Your probe [\\]\\[not the probe\\](https://another.link)\\[probe](/probes/probe-id) with IP address **1.1.1.1** is running an outdated software version and we couldn\'t update it automatically. Please follow [our guide](/probes?view=update-a-probe) to update it manually.',
		});
	});

	it('should not send notification if versions are actual', async () => {
		mockProbesResult([{
			id: 'probe-id',
			userId: 'user-id',
			hardwareDevice: 'v1',
			hardwareDeviceFirmware: 'v2.0',
			nodeVersion: 'v20.13.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([]);
	});

	it('should not send notification if already notified', async () => {
		readByQuery.resolves([{
			item: 'probe-id',
			subject: 'Outdated probe firmware, should be v2.0',
		}]);

		mockProbesResult([{
			id: 'probe-id',
			userId: 'user-id',
			hardwareDevice: 'v1',
			hardwareDeviceFirmware: 'v1.9',
			nodeVersion: 'v20.13.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([]);
	});

	it('should send one notification for multiple probes', async () => {
		readByQuery.resolves([{
			item: null,
			metadata: [ 'probe-id-1' ],
		}]);

		mockProbesResult([
			{
				id: 'probe-id-2',
				ip: '1.1.1.2',
				userId: 'user-id',
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				isOutdated: true,
				nodeVersion: 'v20.12.0',
			},
			{
				id: 'probe-id-3',
				ip: '1.1.1.3',
				userId: 'user-id',
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				isOutdated: true,
				nodeVersion: 'v20.12.0',
			},
		]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([ 'probe-id-2', 'probe-id-3' ]);
		expect(createOne.callCount).to.equal(1);

		expect(createOne.args[0]?.[0]).to.deep.include({
			recipient: 'user-id',
			collection: 'gp_probes',
			metadata: [ 'probe-id-2', 'probe-id-3' ],
			type: 'outdated_software',
			secondary_type: 'v20.13.0',
			subject: 'Your probe containers are running an outdated software version',
		});
	});

	it('should send separate notifications for software and hardware probes', async () => {
		mockProbesResult([
			{
				id: 'probe-sw',
				ip: '1.1.1.2',
				userId: 'user-id',
				hardwareDevice: null,
				hardwareDeviceFirmware: null,
				isOutdated: true,
				nodeVersion: 'v20.12.0',
			},
			{
				id: 'probe-hw-1',
				ip: '1.1.1.3',
				userId: 'user-id',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v1.9',
				isOutdated: true,
				nodeVersion: 'v20.13.0',
			},
			{
				id: 'probe-hw-2',
				ip: '1.1.1.4',
				userId: 'user-id',
				hardwareDevice: 'v1',
				hardwareDeviceFirmware: 'v1.9',
				isOutdated: true,
				nodeVersion: 'v20.13.0',
			},
		]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([ 'probe-sw', 'probe-hw-1', 'probe-hw-2' ]);
		expect(createOne.callCount).to.equal(2);

		expect(createOne.args[0]?.[0]).to.deep.include({
			recipient: 'user-id',
			item: 'probe-sw',
			type: 'outdated_software',
			subject: 'Your probe container is running an outdated software version',
		});

		expect(createOne.args[1]?.[0]).to.deep.include({
			recipient: 'user-id',
			collection: 'gp_probes',
			metadata: [ 'probe-hw-1', 'probe-hw-2' ],
			type: 'outdated_firmware',
			secondary_type: 'v2.0_v20.13.0',
			subject: 'Your hardware probes are running an outdated firmware',
		});
	});

	it('should not send notification if already notified via bulk notification', async () => {
		readByQuery.resolves([{
			item: null,
			metadata: [ 'probe-id-1', 'probe-id-2' ],
		}]);

		mockProbesResult([{
			id: 'probe-id-1',
			ip: '1.1.1.1',
			userId: 'user-id',
			hardwareDevice: null,
			hardwareDeviceFirmware: null,
			isOutdated: true,
			nodeVersion: 'v20.12.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([]);
		expect(createOne.callCount).to.equal(0);
	});
});
