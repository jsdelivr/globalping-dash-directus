import type { OperationContext } from '@directus/extensions';
import Bluebird from 'bluebird';
import _ from 'lodash';
import { escapeMdSymbols } from '../../../../lib/src/probe-name.js';
import { REMOVE_AFTER_DAYS } from '../actions/remove-expired-probes.js';
import type { AdoptedProbe } from '../types.js';

const OFFLINE_PROBE_NOTIFICATIION_TYPE = 'offline_probe';

type OfflineNotification = {
	item: string | null;
	metadata: unknown;
	timestamp: string;
	recipient: string;
};

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

export const getExistingNotifications = async (probes: AdoptedProbe[], { services, getSchema }: OperationContext): Promise<OfflineNotification[]> => {
	const { ItemsService } = services;

	if (!probes.length) {
		return [];
	}

	const notificationsService = new ItemsService<OfflineNotification>('directus_notifications', {
		schema: await getSchema(),
	});

	const userIds = [ ...new Set(probes.map(probe => probe.userId)) ];

	const result = await notificationsService.readByQuery({
		fields: [ 'item', 'metadata', 'timestamp', 'recipient' ],
		filter: {
			type: { _eq: OFFLINE_PROBE_NOTIFICATIION_TYPE },
			collection: { _eq: 'gp_probes' },
			recipient: { _in: userIds },
			timestamp: { _gte: new Date(Date.now() - REMOVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString() },
		},
	});

	return result;
};

export const notifyAdoptions = async (probes: AdoptedProbe[], context: OperationContext): Promise<string[]> => {
	if (!probes.length) {
		return [];
	}

	const probesByUser = _.groupBy(probes, 'userId');
	const ids: string[] = [];

	await Bluebird.map(Object.entries(probesByUser), async ([ userId, userProbes ]) => {
		if (userProbes.length === 1) {
			await notifySingleProbe(userProbes[0]!, userId, context);
		} else {
			await notifyMultipleProbes(userProbes, userId, context);
		}

		ids.push(...userProbes.map(p => p.id));
	});

	return ids;
};

const formatExpirationDate = (lastSyncDate: Date) => {
	const date = new Date(lastSyncDate);
	date.setDate(date.getDate() + REMOVE_AFTER_DAYS);
	return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const notifySingleProbe = async (probe: AdoptedProbe, userId: string, { services, getSchema }: OperationContext) => {
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({ schema: await getSchema() });

	await notificationsService.createOne({
		recipient: userId,
		item: probe.id,
		collection: 'gp_probes',
		type: OFFLINE_PROBE_NOTIFICATIION_TYPE,
		subject: 'Your probe went offline',
		message: `Your ${probe.name ? `probe [${escapeMdSymbols(probe.name)}](/probes/${probe.id}) with IP address **${probe.ip}**` : `[probe with IP address **${probe.ip}**](/probes/${probe.id})`} has been offline for more than 24 hours. If it does not come back online before **${formatExpirationDate(probe.lastSyncDate)}** it will be removed from your account.`,
	});
};

const notifyMultipleProbes = async (probes: AdoptedProbe[], userId: string, { services, getSchema }: OperationContext) => {
	const { NotificationsService } = services;
	const notificationsService = new NotificationsService({ schema: await getSchema() });

	const lines = probes.map(probe => `- ${probe.name ? `[${escapeMdSymbols(probe.name)}](/probes/${probe.id})` : `[probe](/probes/${probe.id})`} with IP address **${probe.ip}** - before **${formatExpirationDate(probe.lastSyncDate)}**`);

	await notificationsService.createOne({
		recipient: userId,
		collection: 'gp_probes',
		metadata: probes.map(p => p.id),
		type: OFFLINE_PROBE_NOTIFICATIION_TYPE,
		subject: 'Your probes went offline',
		message: `Some of your probes have been offline for more than 24 hours and will be removed from your account if they do not come back online:\n${lines.join('\n')}`,
	});
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
			type: 'probe_unassigned',
			subject: 'Your probe has been deleted',
			message: `Your ${probe.name ? `probe **${escapeMdSymbols(probe.name)}**` : 'probe'} with IP address **${probe.ip}** has been deleted from your account due to being offline for more than 30 days. You can adopt it again when it is back online.`,
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
			lastSyncDate: { _lte: new Date(Date.now() - REMOVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString() },
			userId: { _null: true },
		},
	}, { emitEvents: false }) as string[];
	return deletedProbesIds;
};
