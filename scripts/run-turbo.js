import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { execaNode } from 'execa';
import geonames from '../src/extensions/endpoints/city-autocomplete/src/geonames.json' with { type: 'json' };

const [ task, ...args ] = process.argv.slice(2);
const { platform, arch, version } = process;
const libc = platform === 'linux' ? process.report.getReport().header.glibcVersionRuntime ?? 'musl' : '';
const env = { TURBO_RUNTIME: [ platform, arch, version, libc ].join('-') };

if (task === 'test') {
	env.TURBO_TEST_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
}

if (task === 'build') {
	const response = await axios.head(geonames.url, { timeout: 5000 }).catch(() => null);
	const etag = response?.headers.etag;

	// Give an unvalidated archive a one-off cache key. Other builds can still warm their caches.
	env.GEONAMES_ETAG = typeof etag === 'string' && /^"[^"\r\n]*"$/.test(etag) ? etag : `unvalidated-${randomUUID()}`;
}

const turbo = fileURLToPath(import.meta.resolve('turbo/bin/turbo'));
const result = await execaNode(turbo, [ 'run', task, ...args ], {
	env,
	stdio: 'inherit',
	reject: false,
});

process.exitCode = result.exitCode ?? 1;
