export type DirectusUser = {
	id: string;
	external_identifier: string;
	github_username: string | null;
	status: string;
	suspended_at: string | null;
};
