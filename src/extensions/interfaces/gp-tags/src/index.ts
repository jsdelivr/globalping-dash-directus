import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'gp-tags',
	name: 'Globalping Tags',
	icon: 'local_offer',
	description: 'Globalping tags for the adopted probes.',
	component: InterfaceComponent,
	options: null,
	types: [ 'json' ],
});
