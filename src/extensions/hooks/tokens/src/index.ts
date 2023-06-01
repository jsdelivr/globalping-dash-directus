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

const getKeysDeep = (entity: object | object[] | string[]) => {
	const keys = _.isArray(entity) ? [] : Object.keys(entity);

	const nestedKeys: string[] = _.flatMapDeep(entity, (value) => {
	  if (_.isObject(value)) {
		  return getKeysDeep(value);
	  }
	  return [];
	});

	return [...keys, ...nestedKeys];
}

const validateQuery = (query: {filter?: object, search?: object} = {}, exceptions: any) => {
	const { InvalidPayloadException } = exceptions;

	if (query.filter) {
		const filterKeys = getKeysDeep(query.filter);
		const dataFields = _.uniq(filterKeys).filter(key => !key.startsWith('_'));
		if (_.isEqual(dataFields, ['id'])) {
			return; // Allow to query by "id", that is required to not break the UI
		}
	  	throw new InvalidPayloadException('Filtering is not availiable for "tokens" collection');
	} else if (query.search) {
	  	throw new InvalidPayloadException('Searching is not availiable for "tokens" collection');
	}
};

export default defineHook(({ action, filter }, { exceptions }) => {
	filter('tokens.items.query', (query) => {
		validateQuery(query as {}, exceptions);
	});

	filter('tokens.items.read', (_items, request) => {
		validateQuery(request.query, exceptions);
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
