import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'github-username',
	name: 'Github Username',
	icon: 'account_box',
	description: 'Input with current user GitHub Username and a button to sync it.',
	component: InterfaceComponent,
	options: null,
	types: [ 'string' ],
});
