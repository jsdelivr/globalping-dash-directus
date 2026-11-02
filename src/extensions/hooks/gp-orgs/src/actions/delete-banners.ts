import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';
import TTLCache from '@isaacs/ttlcache';

// Banner ids of the orgs being deleted, passed from the delete filter to the action.
const pendingBanners = new TTLCache<string, string>({ ttl: 60 * 1000 });

export const collectBanners = async (keys: string[], { database }: EventContext) => {
	const orgs = await database('gp_orgs').whereIn('id', keys).whereNotNull('banner').select<{ id: string; banner: string }[]>('id', 'banner');
	orgs.forEach(org => pendingBanners.set(org.id, org.banner));
};

export const deleteBanners = async (keys: string[], { services, getSchema }: HookExtensionContext) => {
	const banners = keys.map(id => pendingBanners.get(id)).filter(Boolean) as string[];
	keys.forEach(id => pendingBanners.delete(id));

	if (!banners.length) {
		return;
	}

	await new services.FilesService({ schema: await getSchema() }).deleteMany(banners);
};
