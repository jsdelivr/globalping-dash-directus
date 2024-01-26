import { createError } from '@directus/errors';
import _ from 'lodash';

const FilteringError = createError('INVALID_PAYLOAD_ERROR', 'Filtering is not availiable for "gp_tokens" collection', 400);

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

		if (_.isEqual(dataFields, [ 'id' ])) {
			return; // Allow to query by "id". That is required to not break the UI.
		}

		throw new FilteringError();
	} else if (query.search) {
		throw new FilteringError();
	}
};
