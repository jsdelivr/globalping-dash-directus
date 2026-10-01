export type Operation = 'probes' | 'tokens' | 'credits' | 'redirect';

export type Transfer = {
	userId: string;
	userAccountId: string;
	userGithubId: string | null;
	orgId: string;
	orgAccountId: string;
	orgGithubId: string;
};
