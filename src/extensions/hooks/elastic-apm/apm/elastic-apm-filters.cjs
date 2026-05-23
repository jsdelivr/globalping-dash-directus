let apmAgent;
let apmUtils;

try {
	apmAgent = require('elastic-apm-node');
	({ apm: apmUtils } = require('elastic-apm-utils'));
} catch {}

const errorFilter = (payload) => {
	const attributes = payload.exception?.attributes;
	const status = Number(attributes?.status);

	if (attributes?.name === 'DirectusError' && status < 500) {
		return false;
	}

	return payload;
};

if (apmAgent) {
	globalThis.__elasticApmAgent = apmAgent;

	apmAgent.addTransactionFilter(apmUtils.transactionFilter());
	apmAgent.addErrorFilter(errorFilter);
}

module.exports = {
	errorFilter,
};
