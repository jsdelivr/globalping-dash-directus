import knex, { Knex } from 'knex';
import knexfile from '../../../knexfile.js';

const env = process.env['NODE_ENV'] || 'e2e';

export const client: Knex = knex(knexfile[env] || {});
