export type ExtraAdoptionToken = {
	github_username: string;
	github_id?: string | null;
	token: string;
};

export type Org = {
	id?: string;
	adoption_token?: string;
	extra_adoption_tokens?: ExtraAdoptionToken[];
};
