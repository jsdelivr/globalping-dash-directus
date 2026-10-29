import { defineModule } from '@directus/extensions-sdk';
import DashboardRedirect from './dashboard-redirect.vue';

export default defineModule({
	id: 'redirect',
	name: 'Dashboard Redirect',
	icon: 'open_in_new',
	hidden: true,
	routes: [
		{
			path: '',
			component: DashboardRedirect,
		},
	],
});
