export type DirectusUser = {
	id: string;
	external_identifier: string;
	github_oauth_token: string | null;
};

export type GithubUser = {
	login: string;
	id: number;
};
