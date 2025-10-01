import type { OperationContext } from '@directus/extensions';
import type { Notification } from '@directus/types';
import Bluebird from 'bluebird';
import { REMOVE_AFTER_DAYS } from '../actions/remove-expired-probes.js';
import type { AdoptedProbe } from '../types.js';

const OFFLINE_PROBE_NOTIFICATIION_TYPE = 'offline_probe';

export const getOfflineAdoptions = async ({ services, database, getSchema }: OperationContext): Promise<AdoptedProbe[]> => {
	const { ItemsService } = services;

	const probesService = new ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const rows: (Omit<AdoptedProbe, 'lastSyncDate'> & { lastSyncDate: string })[] = await probesService.readByQuery({
		filter: {
			status: 'offline',
			userId: { _nnull: true },
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
			type: OFFLINE_PROBE_NOTIFICATIION_TYPE,
			collection: 'gp_probes',
			item: {
				_in: probes.map(probe => probe.id),
			},
			timestamp: { _gte: new Date(Date.now() - REMOVE_AFTER_DAYS * 24 * 60 * 60 * 1000) },
		},
	});

	return result;
};

export const notifyAdoptions = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext): Promise<string[]> => {
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
			item: probe.id,
			collection: 'gp_probes',
			type: OFFLINE_PROBE_NOTIFICATIION_TYPE,
			subject: 'Your probe went offline',
			message: `Your ${probe.name ? `probe [**${probe.name}**](/probes/${probe.id}) with IP address **${probe.ip}**` : `[probe with IP address **${probe.ip}**](/probes/${probe.id})`} has been offline for more than 24 hours. If it does not come back online before **${dateOfExpiration.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}** it will be removed from your account.`,
		});
	});

	return probes.map(probe => probe.id);
};

export const deleteAdoptions = async (probes: AdoptedProbe[], { services, database, getSchema }: OperationContext): Promise<string[]> => {
	const { NotificationsService, ItemsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema({ database }),
		knex: database,
	});

	const probesService = new ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	await Bluebird.map(probes, async (probe) => {
		await notificationsService.createOne({
			recipient: probe.userId,
			subject: 'Your probe has been deleted',
			message: `Your ${probe.name ? `probe **${probe.name}**` : 'probe'} with IP address **${probe.ip}** has been deleted from your account due to being offline for more than 30 days. You can adopt it again when it is back online.`,
			item: probe.id,
			collection: 'gp_probes',
		});
	});

	let deletedAdoptionsIds: string[] = [];

	if (probes.length) {
		deletedAdoptionsIds = await probesService.deleteByQuery({ filter: { id: { _in: probes.map(probe => probe.id) } } }, { emitEvents: false }) as string[];
	}


	return deletedAdoptionsIds;
};

export const deleteProbes = async ({ services, database, getSchema }: OperationContext): Promise<string[]> => {
	const { ItemsService } = services;

	const probesService = new ItemsService('gp_probes', {
		schema: await getSchema({ database }),
		knex: database,
	});

	const deletedProbesIds = await probesService.deleteByQuery({ filter: { status: 'offline', lastSyncDate: { _lte: new Date(Date.now() - REMOVE_AFTER_DAYS * 24 * 60 * 60 * 1000) } } }, { emitEvents: false }) as string[];
	return deletedProbesIds;
};
