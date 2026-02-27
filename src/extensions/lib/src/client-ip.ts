import { IncomingMessage } from 'node:http';

const ipv4MappedPattern = /^::ffff:/i;

/**
 * Returns the real client IP provided by Cloudflare.
 * Normalizes IPv4-mapped IPv6 address into IPv4.
 */
export const getIpFromRequest = (req: IncomingMessage) => {
	const ip = typeof req.headers['true-client-ip'] === 'string' ? req.headers['true-client-ip'] : req.socket.remoteAddress || '';

	if (ipv4MappedPattern.test(ip)) {
		return ip.slice(7);
	}

	return ip;
};
