import { defineHook } from '@directus/extensions-sdk';
import _ from 'lodash';

type Token = {
    id: number;
    name: string;
    value: string;
    expire?: string;
    origins?: string;
    date_created: string;
    date_updated?: string;
    user_created: string;
    user_updated?: string;
};

type Revision = {
    data: Token;
    delta: Token;
};

const hasField = (obj = {}, field: string): boolean => {
	return _.some(obj, (value, key) => {
		if (key === field) {
			return true;
		} else if (_.isObject(value)) {
			return hasField(value, field);
		}
		return false;
	});
};

export default defineHook(({ action, filter }, { exceptions }) => {
	const { InvalidPayloadException } = exceptions;

	filter('tokens.items.query', (query) => {
		if (hasField(query?.filter, 'value')) {
			throw new InvalidPayloadException('Filter by "value" is not available');
		}
	});

	filter('tokens.items.read', (query) => {
		if (hasField(query?.query?.filter, 'value')) {
			throw new InvalidPayloadException('Filter by "value" is not available');
		}
	});

	action('tokens.items.read', (query) => {
		const payload = query.payload as Token[];
		payload.forEach((item) => {
			if (item.value) {
				item.value = '********';
			}
		});
	});

	action('revisions.read', (query) => {
		const payload = query.payload as Revision[];
		payload.forEach((item) => {
			if (item.data?.value) {
				item.data.value = '********';
			}

			if (item.delta?.value) {
				item.delta.value = '********';
			}
		});
	});
});
