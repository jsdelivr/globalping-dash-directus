import type { OperationContext } from '@directus/extensions';
import { expect } from 'chai';
import * as sinon from 'sinon';
import operationApi from '../src/api.js';

describe('Adopted probes credits cron handler', () => {
	const transaction = sinon.stub();
	const context = {
		database: { transaction },
	} as unknown as OperationContext;

	beforeEach(() => {
		transaction.reset();
	});

	for (const missing of [ 'CREDITS_PER_ADOPTED_PROBE_DAY', 'ADOPTED_PROBES_REQUIRED_ONLINE_TIMES' ]) {
		it(`rejects missing ${missing} before touching counters or credits`, async () => {
			const env: Record<string, string> = { CREDITS_PER_ADOPTED_PROBE_DAY: '100', ADOPTED_PROBES_REQUIRED_ONLINE_TIMES: '120' };
			delete env[missing];
			const error = await (operationApi.handler({}, { ...context, env }) as Promise<string>).catch(error => error);

			expect(error).to.deep.equal(new Error(`${missing} was not provided`));
			expect(transaction.called).to.equal(false);
		});
	}

	for (const [ amount, required ] of [ [ 'invalid', '120' ], [ '-1', '120' ], [ '100', '0' ], [ '1.5', '120' ], [ ' ', '120' ] ]) {
		it(`rejects invalid settings (${amount}, ${required}) before touching counters or credits`, async () => {
			const env = { CREDITS_PER_ADOPTED_PROBE_DAY: amount!, ADOPTED_PROBES_REQUIRED_ONLINE_TIMES: required! };
			const error = await (operationApi.handler({}, { ...context, env }) as Promise<string>).catch(error => error);

			expect(error).to.be.instanceOf(Error);
			expect(transaction.called).to.equal(false);
		});
	}
});
