import { createError } from '@directus/errors';
import _ from 'lodash';

const FilteringError = createError('INVALID_PAYLOAD_ERROR', 'Filtering is not available for "gp_tokens" collection', 400);

const getKeysDeep = (entity: object | object[] | string[]) => {
	const keys = _.isArray(entity) ? [] : Object.keys(entity);

	const nestedKeys: string[] = _.flatMapDeep(entity, (value) => {
		if (_.isObject(value)) {
			return getKeysDeep(value);
		}

		return [];
	});

	return [ ...keys, ...nestedKeys ];
};

export const validateQuery = (query: {filter?: object, search?: object} = {}) => {
	if (query.filter) {
		const filterKeys = getKeysDeep(query.filter);
		const dataFields = _.uniq(filterKeys).filter(key => !key.startsWith('_'));

		if (dataFields.every(field => [ 'id', 'user_created', 'app_id' ].includes(field))) {
			return; // Filter by "id" is required to not break the Directus UI. And "user_created" and "app_id" for Dashboard.
		}

		throw new FilteringError();
	} else if (query.search) {
		throw new FilteringError();
	}
};
