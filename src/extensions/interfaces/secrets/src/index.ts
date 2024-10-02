import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'secrets',
	name: 'Secrets',
	icon: 'box',
	description: 'Array of generated secret values.',
	component: InterfaceComponent,
	options: null,
	types: [ 'json' ],
});
