const fs = require('node:fs');
const path = require('node:path');

let version;

try {
	version = fs.readFileSync(path.join(__dirname, 'LAST_COMMIT_HASH.txt'), 'utf8').trim() || undefined;
} catch {}

module.exports = {
	serviceName: 'globalping-dash-directus',
	serviceVersion: version,
	logLevel: 'fatal',
	centralConfig: false,
	captureBody: false,
	captureErrorLogStackTraces: 'always',
	ignoreUrls: [ '/favicon.ico', '/server/health' ],
	transactionSampleRate: 0.25,
	exitSpanMinDuration: '2ms',
	spanCompressionSameKindMaxDuration: '10ms',
};
