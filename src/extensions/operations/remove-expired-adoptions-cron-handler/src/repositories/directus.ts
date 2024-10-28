import type { OperationContext } from '@directus/extensions';
import type { Notification } from '@directus/types';
import Bluebird from 'bluebird';
import { REMOVE_AFTER_DAYS } from '../actions/remove-expired-probes.js';
import type { AdoptedProbe } from '../types.js';

export const getOfflineProbes = async ({ services, database, getSchema }: OperationContext): Promise<AdoptedProbe[]> => {
	const { ItemsService } = services;

	const probesService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const rows: (Omit<AdoptedProbe, 'lastSyncDate'> & { lastSyncDate: string })[] = await probesService.readByQuery({
		filter: {
			status: 'offline',
		},
	});

	return rows.map(row => ({
		...row,
		lastSyncDate: new Date(row.lastSyncDate),
	}));
};

export const getExistingNotifications = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext): Promise<Notification[]> => {
	const { ItemsService } = services;

	if (!probes.length) {
		return [];
	}

	const notificationsService = new ItemsService('directus_notifications', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await notificationsService.readByQuery({
		filter: {
			subject: 'Your probe went offline',
			collection: 'gp_adopted_probes',
			item: {
				_in: probes.map(probe => probe.id),
			},
			timestamp: { _gte: '$NOW(-30 day)' },
		},
	});
	return result;
};

export const notifyProbes = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext): Promise<string[]> => {
	const { NotificationsService } = services;

	if (!probes.length) {
		return [];
	}

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await Bluebird.map(probes, async (probe) => {
		const dateOfExpiration = new Date(probe.lastSyncDate);
		dateOfExpiration.setDate(dateOfExpiration.getDate() + REMOVE_AFTER_DAYS);

		await notificationsService.createOne({
			recipient: probe.userId,
			subject: 'Your probe went offline',
			message: `Your probe ${probe.name ? `**${probe.name}** ` : ''}with IP address **${probe.ip}** has been offline for more than 24 hours. If it does not come back online before **${dateOfExpiration.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}** it will be removed from your account.`, // make name a link to the probe details
			item: probe.id,
			collection: 'gp_adopted_probes',
		});
	});

	return probes.map(probe => probe.id);
};

export const deleteProbes = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext): Promise<string[]> => {
	const { ItemsService } = services;

	if (!probes.length) {
		return [];
	}

	const probesService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	// TODO: Send notification here

	const result = await probesService.deleteByQuery({ filter: { id: { _in: probes.map(probe => probe.id) } } }) as string[];
	return result;
};
