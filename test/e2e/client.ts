import knex, { Knex } from 'knex';
// eslint-disable-next-line n/no-missing-import
import knexfile from '../../knexfile.js';

export const client: Knex = knex(knexfile['e2e']);
