export type OrgMember = {
	membershipId: string;
	githubId: string;
	githubUsername: string | null;
	githubOauthToken: string | null;
};

export type Org = {
	id: string;
	name: string;
	githubId: string;
	members: OrgMember[];
};
