import { expect } from 'chai';
import * as sinon from 'sinon';
import defineHook from '../src/index.js';

type InitCallback = ({ app }: { app: any }) => Promise<void>;
type ActionCallback = (meta: any, context: any) => Promise<void>;

describe('notifications-format hooks', () => {
	const app = { use: sinon.stub() };

	const callbacks = {
		init: {} as Record<string, InitCallback>,
		action: {} as Record<string, ActionCallback>,
	};
	const events = {
		init: (name: string, cb: InitCallback) => {
			callbacks.init[name] = cb;
		},
		action: (name: string, cb: ActionCallback) => {
			callbacks.action[name] = cb;
		},
	} as any;

	defineHook(events);

	beforeEach(() => {
		sinon.resetHistory();
	});

	it('should return notification message as html if format=html param passed', () => {
		callbacks.init['middlewares.after']?.({ app });
		const middleware = app.use.args?.[0]?.[0];
		const req: Record<string, unknown> = { method: 'GET', query: { format: 'html' }, accountability: {} };
		middleware(req, {}, () => {});
		const payload = [{
			message: `Globalping API detected that your adopted probe with ip: 51.158.22.211 is located at “FR”. So its country value changed from “IT” to “FR”, and custom city value “Naples” is not applied right now.\n\nIf this change is not right please report in [that issue](https://github.com/jsdelivr/globalping/issues/268).`,
		}];

		callbacks.action['notifications.read']?.({ payload }, { accountability: { customParams: { format: 'html' } } });

		expect(app.use.callCount).to.equal(1);
		expect(req.accountability).to.deep.equal({ customParams: { format: 'html' } });

		expect(payload).to.deep.equal([{
			message: '<p>Globalping API detected that your adopted probe with ip: 51.158.22.211 is located at “FR”. So its country value changed from “IT” to “FR”, and custom city value “Naples” is not applied right now.</p>\n<p>If this change is not right please report in <a href="https://github.com/jsdelivr/globalping/issues/268">that issue</a>.</p>\n',
		}]);
	});

	it('should return notification message as md by default', async () => {
		callbacks.init['middlewares.after']?.({ app });
		const middleware = app.use.args?.[0]?.[0];
		const req: Record<string, unknown> = { method: 'GET', query: { sort: 'asc' }, accountability: {} };
		middleware(req, {}, () => {});
		const payload = [{
			message: `Globalping API detected that your adopted probe with ip: 51.158.22.211 is located at “FR”. So its country value changed from “IT” to “FR”, and custom city value “Naples” is not applied right now.\n\nIf this change is not right please report in [that issue](https://github.com/jsdelivr/globalping/issues/268).`,
		}];

		callbacks.action['notifications.read']?.({ payload }, { accountability: {} });

		expect(app.use.callCount).to.equal(1);
		expect(req.accountability).to.deep.equal({});

		expect(payload).to.deep.equal([{
			message: 'Globalping API detected that your adopted probe with ip: 51.158.22.211 is located at “FR”. So its country value changed from “IT” to “FR”, and custom city value “Naples” is not applied right now.\n\nIf this change is not right please report in [that issue](https://github.com/jsdelivr/globalping/issues/268).',
		}]);
	});
});
