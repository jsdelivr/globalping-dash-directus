import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { checkOutdatedFirmware } from '../src/actions/check-outdated-firmware.js';

describe('Adopted probes status cron handler', () => {
	const sql = {
		select: sinon.stub(),
		whereRaw: sinon.stub(),
		orderBy: sinon.stub(),
		limit: sinon.stub(),
	};
	sql.select.returns(sql);
	sql.whereRaw.returns(sql);
	sql.orderBy.returns(sql);
	sql.limit.returns(sql);
	const database = sinon.stub().returns(sql) as any;
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
	};


	beforeEach(() => {
		readByQuery.resolves([]);
		sql.limit.resolves([]);
		sinon.resetHistory();
	});

	it('should send notification about outdated firmware', async () => {
		sql.limit.onFirstCall().resolves([{
			id: 'probe-id',
			userId: 'user-id',
			hardwareDevice: 'v1',
			hardwareDeviceFirmware: 'v1.9',
			nodeVersion: 'v20.13.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([ 'probe-id' ]);

		expect(createOne.args[0]?.[0]).to.deep.equal({
			recipient: 'user-id',
			item: 'probe-id',
			collection: 'gp_adopted_probes',
			type: 'outdated_firmware',
			secondary_type: 'v2.0_v20.13.0',
			subject: 'Your probe is running an outdated firmware',
			message: 'Your [probe with IP address **undefined**](/probes/probe-id) is running an outdated firmware and we couldn\'t update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.',
		});
	});

	it('should send notification about outdated node.js', async () => {
		sql.limit.onFirstCall().resolves([{
			id: 'probe-id',
			userId: 'user-id',
			hardwareDevice: 'v1',
			hardwareDeviceFirmware: 'v2.0',
			nodeVersion: 'v20.12.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([ 'probe-id' ]);

		expect(createOne.args[0]?.[0]).to.deep.equal({
			recipient: 'user-id',
			item: 'probe-id',
			collection: 'gp_adopted_probes',
			type: 'outdated_firmware',
			secondary_type: 'v2.0_v20.13.0',
			subject: 'Your probe is running an outdated firmware',
			message: 'Your [probe with IP address **undefined**](/probes/probe-id) is running an outdated firmware and we couldn\'t update it automatically. Please follow [our guide](https://github.com/jsdelivr/globalping-hwprobe#download-the-latest-firmware) to update it manually.',
		});
	});

	it('should not send notification if versions are actual', async () => {
		sql.limit.onFirstCall().resolves([{
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

		sql.limit.onFirstCall().resolves([{
			id: 'probe-id',
			userId: 'user-id',
			hardwareDevice: 'v1',
			hardwareDeviceFirmware: 'v1.9',
			nodeVersion: 'v20.13.0',
		}]);

		const result = await checkOutdatedFirmware({ data, database, env, getSchema, services, logger, accountability });

		expect(result).to.deep.equal([]);
	});
});
