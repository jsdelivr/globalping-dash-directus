import { createError } from '@directus/errors';
import _ from 'lodash';

const FilteringError = createError('INVALID_PAYLOAD_ERROR', 'Filtering is not available for "gp_tokens" collection', 400);

const getKeysDeep = (entity: object | object[] | string[]): string[] => {
	const keys = _.isArray(entity) ? [] : Object.keys(entity);

	const nestedKeys: string[] = _.flatMapDeep(entity, (value) => {
		if (_.isObject(value)) {
			return getKeysDeep(value);
		}

		return [];
	});

	return [ ...keys, ...nestedKeys ];
};

const getValuesDeep = (entity: unknown): string[] => {
	if (_.isString(entity)) {
		return [ entity.replace(/^-/, '').split('.').pop()! ];
	}

	if (_.isObject(entity)) {
		return _.flatMap(Object.values(entity), getValuesDeep);
	}

	return [];
};

export const validateQuery = (query: { filter?: object; search?: object } = {}) => {
	if (getValuesDeep(_.pick(query, [ 'sort', 'group', 'aggregate', 'alias' ])).includes('value')) {
		throw new FilteringError();
	}

	if (query.filter) {
		const filterKeys = getKeysDeep(query.filter);
		const dataFields = _.uniq(filterKeys).filter(key => !key.startsWith('_'));

		if (dataFields.every(field => [ 'id', 'user_created', 'app_id', 'account_id' ].includes(field))) {
			return; // Filter by "id" is required to not break the Directus UI. And "user_created", "app_id" and "account_id" for Dashboard.
		}

		throw new FilteringError();
	} else if (query.search) {
		throw new FilteringError();
	}
};
