import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import { getOrgsToCheck, removeMemberships } from '../repositories/directus.js';
import { findLeftMemberships } from '../repositories/github.js';

export const checkMembers = async (context: OperationContext) => {
	const orgs = await getOrgsToCheck(context);
	const removed: string[] = [];
	const errors: string[] = [];

	await Bluebird.map(orgs, async (org) => {
		try {
			const left = await findLeftMemberships(org);
			await removeMemberships(left, context);
			removed.push(...left);
		} catch (error) {
			context.logger.error(error);
			errors.push(error instanceof Error ? error.message : String(error));
		}
	}, { concurrency: 2 });

	return { checked: orgs.length, removed, errors };
};
