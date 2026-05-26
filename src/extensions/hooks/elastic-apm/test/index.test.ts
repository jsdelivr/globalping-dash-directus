import { expect } from 'chai';
import * as sinon from 'sinon';
import { applyApmUserContext } from '../src/index.js';

describe('elastic-apm hook', () => {
	it('should add Directus user data to Elastic APM', () => {
		const apmAgent = {
			setUserContext: sinon.stub(),
		};

		applyApmUserContext({
			github_username: 'github-user',
			id: 'user-id',
		}, apmAgent);

		expect(apmAgent.setUserContext.args).to.deep.equal([
			[{ id: 'user-id', username: 'github-user' }],
		]);
	});

	it('should use the user id as username fallback', () => {
		const apmAgent = {
			setUserContext: sinon.stub(),
		};

		applyApmUserContext({ github_username: null, id: 'user-id' }, apmAgent);

		expect(apmAgent.setUserContext.args).to.deep.equal([
			[{ id: 'user-id', username: 'ID(user-id)' }],
		]);
	});

	it('should skip missing users', () => {
		const apmAgent = {
			setUserContext: sinon.stub(),
		};

		applyApmUserContext(undefined, apmAgent);

		expect(apmAgent.setUserContext.callCount).to.equal(0);
	});
});
