import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'visible-token',
	name: 'Visible Token',
	icon: 'vpn_key',
	description: 'Visible token, that is shown to the user every time',
	component: InterfaceComponent,
	options: null,
	types: [ 'string' ],
});
