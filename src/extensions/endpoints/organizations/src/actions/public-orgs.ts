import type { EndpointExtensionContext } from '@directus/extensions';

export type PublicOrg = {
	name: string;
	website: string | null;
	description: string | null;
	bannerId: string | null;
};

// An org is listed when its probes are public and it has filled in at least one part of its profile.
const queryPublicOrgs = ({ database }: EndpointExtensionContext) => database('gp_orgs')
	.where({ public_probes: true })
	.where(query => query.whereNotNull('banner').orWhere('website', '<>', '').orWhere('description', '<>', ''))
	.select('name', 'website', 'description', 'banner as bannerId');

export const getPublicOrgs = (context: EndpointExtensionContext): Promise<PublicOrg[]> => queryPublicOrgs(context).orderBy('name');

export const getPublicOrg = (name: string, context: EndpointExtensionContext): Promise<PublicOrg | undefined> => queryPublicOrgs(context).where({ name }).first();
