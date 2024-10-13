import { defineEndpoint } from '@directus/extensions-sdk';
import Handlebars from 'handlebars';

const template = Handlebars.compile(`
	<!DOCTYPE html>
	<html>
		<head>
			<meta http-equiv="refresh" content="0; URL='{{redirect}}'">
			<title>Redirecting to {{redirect}}</title>
			<script>setTimeout(() => location.href = '{{redirect}}', 100)</script>
		</head>

		<body></body>
	</html>
`);

export default defineEndpoint((router) => {
	router.get('/', (req, res) => {
		const dashHome = 'https://dash.globalping.io';
		const requestRedirect = new URL(typeof req.query.url === 'string' ? req.query.url : '', dashHome);
		const isRequestRedirectValid = requestRedirect.hostname === 'globalping.io' || requestRedirect.hostname.endsWith('.globalping.io');
		const redirect = isRequestRedirectValid ? requestRedirect.toString() : dashHome;

		res.send(template({ redirect }));
	});
});
