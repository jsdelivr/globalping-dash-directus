import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { increaseOnlineTimes } from '../src/repositories/directus.js';

describe('Probes status cron handler', () => {
	const increment = sinon.stub().resolves(2);
	const where = sinon.stub().returns({ increment });
	const database = sinon.stub().returns({ where }) as unknown as OperationContext['database'];

	beforeEach(() => {
		sinon.resetHistory();
	});

	it('should increment "onlineTimesToday" of the ready probes in one query', async () => {
		const result = await increaseOnlineTimes({ database } as OperationContext);

		expect((database as unknown as sinon.SinonStub).args[0]).to.deep.equal([ 'gp_probes' ]);
		expect(where.args[0]).to.deep.equal([{ status: 'ready' }]);
		expect(increment.args[0]).to.deep.equal([ 'onlineTimesToday', 1 ]);
		expect(result).to.equal(2);
	});
});
