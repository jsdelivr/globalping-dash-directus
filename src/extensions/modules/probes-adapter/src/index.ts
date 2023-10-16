import { defineModule } from '@directus/extensions-sdk';
import ProbesAdapter from './probes-adapter.vue';

export default defineModule({
	id: 'probes-adapter',
	name: 'Adopt probes',
	icon: 'router',
	routes: [
		{
			path: '',
			component: ProbesAdapter,
		},
	],
});
