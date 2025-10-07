import type { OperationContext } from '@directus/extensions';
import type { Notification } from '@directus/types';
import Bluebird from 'bluebird';
import { REMOVE_AFTER_DAYS } from '../actions/remove-expired-probes.js';
import type { AdoptedProbe } from '../types.js';

const OFFLINE_PROBE_NOTIFICATIION_TYPE = 'offline_probe';

export const getOfflineAdoptions = async ({ services, getSchema }: OperationContext): Promise<AdoptedProbe[]> => {
	const { ItemsService } = services;

	const probesService = new ItemsService<Omit<AdoptedProbe, 'lastSyncDate'> & { lastSyncDate: string }>('gp_probes', {
		schema: await getSchema(),
	});

	const rows = await probesService.readByQuery({
		filter: {
			status: { _eq: 'offline' },
			userId: { _nnull: true },
		},
	});

	return rows.map(row => ({
		...row,
		lastSyncDate: new Date(row.lastSyncDate),
	}));
};

export const getExistingNotifications = async (probes: AdoptedProbe[], { services, getSchema }: OperationContext): Promise<Notification[]> => {
	const { ItemsService } = services;

	if (!probes.length) {
		return [];
	}

	const notificationsService = new ItemsService<Notification>('directus_notifications', {
		schema: await getSchema(),
	});

	const result = await notificationsService.readByQuery({
		filter: {
			type: { _eq: OFFLINE_PROBE_NOTIFICATIION_TYPE },
			collection: { _eq: 'gp_probes' },
			item: {
				_in: probes.map(probe => probe.id),
			},
			timestamp: { _gte: new Date(Date.now() - REMOVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toString() },
		},
	});

	return result;
};

export const notifyAdoptions = async (probes: AdoptedProbe[], { services, getSchema }: OperationContext): Promise<string[]> => {
	const { NotificationsService } = services;

	if (!probes.length) {
		return [];
	}

	const notificationsService = new NotificationsService({
		schema: await getSchema(),
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

export const deleteAdoptions = async (probes: AdoptedProbe[], { services, getSchema }: OperationContext): Promise<string[]> => {
	const { NotificationsService, ItemsService } = services;

	const notificationsService = new NotificationsService({
		schema: await getSchema(),
	});

	const probesService = new ItemsService('gp_probes', {
		schema: await getSchema(),
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

export const deleteProbes = async ({ services, getSchema }: OperationContext): Promise<string[]> => {
	const { ItemsService } = services;

	const probesService = new ItemsService('gp_probes', {
		schema: await getSchema(),
	});

	const deletedProbesIds = await probesService.deleteByQuery({
		filter: {
			status: { _eq: 'offline' },
			lastSyncDate: { _lte: new Date(Date.now() - REMOVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toString() },
			userId: { _null: true },
		},
	}, { emitEvents: false }) as string[];
	return deletedProbesIds;
};
