import type { OperationContext } from '@directus/extensions';
import type { Notification } from '@directus/types';
import Bluebird from 'bluebird';
import type { AdoptedProbe } from '../types.js';

export const getOfflineProbes = async ({ services, database, getSchema }: OperationContext): Promise<AdoptedProbe[]> => {
	const { ItemsService } = services;

	const probesService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const result = await probesService.readByQuery({
		filter: {
			status: 'offline',
		},
	}) as AdoptedProbe[];
	return result;
};

export const getExistingNotifications = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext): Promise<Notification[]> => {
	const { ItemsService } = services;

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

export const notifyProbes = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext) => {
	const { NotificationsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	await Bluebird.map(probes, async (probe) => {
		await notificationsService.createOne({
			recipient: probe.userId,
			subject: 'Your probe went offline',
			message: `Your probe ${probe.name ? `**${probe.name}** ` : ''}with IP address **${probe.ip}** has been offline for more than 24 hours. If it does not come back online before ${''} it will be removed from your account.`, // make name a link to the probe details
			item: probe.id,
			collection: 'gp_adopted_probes',
		});
	});
};

export const deleteProbes = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext) => {
	const { ItemsService } = services;

	const probesService = new ItemsService('gp_adopted_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	// TODO: Send notification here

	const result = await probesService.deleteByQuery({ filter: { id: { _in: probes.map(probe => probe.id) } } }) as string[];
	return result;
};
