import knex, { Knex } from 'knex';
import knexfile from '../../knexfile.js';

export const client: Knex = knex(knexfile['e2e']);
