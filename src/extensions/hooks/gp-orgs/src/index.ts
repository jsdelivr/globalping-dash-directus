import { defineHook } from '@directus/extensions-sdk';
import { addAdoptionTokens } from './actions/add-adoption-tokens.js';
import { collectBanners, deleteBanners } from './actions/delete-banners.js';
import { validateExtraAdoptionTokens } from './actions/validate.js';
import type { Org } from './types.js';

export default defineHook(({ filter, action }, hookContext) => {
	filter('gp_orgs.items.read', async (payload, _meta, context) => {
		const orgs = payload as Org[];
		const { accountability } = context;

		if (!accountability?.user || accountability.admin) {
			return payload;
		}

		// Adoption tokens are not available by permissions (so members and viewers cannot see them but still have read access), so they are added in hook and only for admins.
		await addAdoptionTokens(orgs, context);

		return payload;
	});

	filter('gp_orgs.items.update', async (payload, meta, context) => {
		const fields = payload as Record<string, unknown>;
		'extra_adoption_tokens' in fields && await validateExtraAdoptionTokens(fields.extra_adoption_tokens, meta.keys as string[], context);
	});

	// The filter runs before the access check to store file ids for action to delete.
	filter('gp_orgs.items.delete', async (payload, _meta, context) => {
		await collectBanners(payload as string[], context);
		return payload;
	});

	action('gp_orgs.items.delete', async ({ keys }) => {
		await deleteBanners(keys as string[], hookContext);
	});
});
