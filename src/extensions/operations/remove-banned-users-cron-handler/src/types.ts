export type DirectusUser = {
	id: string;
	external_identifier: string;
	github_username: string | null;
	status: string;
	date_updated: string | null;
};
