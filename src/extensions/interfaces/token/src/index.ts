import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'token',
	name: 'Token',
	icon: 'vpn_key',
	description: 'Secured token, that is shown to the user only once',
	component: InterfaceComponent,
	options: null,
	types: ['string'],
});
