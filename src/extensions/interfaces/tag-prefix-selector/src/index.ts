import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'tag-prefix-selector',
	name: 'Tag Prefix Selector',
	icon: 'local_offer',
	description: 'Default prefix picker for GP tags.',
	component: InterfaceComponent,
	options: null,
	types: [ 'string' ],
});
