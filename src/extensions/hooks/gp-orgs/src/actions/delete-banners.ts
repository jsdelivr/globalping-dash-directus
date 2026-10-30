import type { HookExtensionContext } from '@directus/extensions';
import type { EventContext } from '@directus/types';

// Banner ids of the orgs being deleted, passed from the delete filter to the action.
const pendingBanners = new WeakMap<object, string[]>();

export const collectBanners = async (keys: string[], { database }: EventContext) => {
	const banners = await database('gp_orgs').whereIn('id', keys).whereNotNull('banner').pluck('banner') as string[];
	pendingBanners.set(keys, banners);
};

export const deleteBanners = async (keys: string[], { services, getSchema }: HookExtensionContext) => {
	const banners = pendingBanners.get(keys);
	pendingBanners.delete(keys);

	if (!banners?.length) {
		return;
	}

	await new services.FilesService({ schema: await getSchema() }).deleteMany(banners);
};
