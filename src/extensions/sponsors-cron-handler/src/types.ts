export type DirectusSponsor = {
	id: string;
	githubLogin: string;
	githubId: string;
	monthlyAmount: number;
	lastEarningDate: string;
}

export type GithubSponsor = {
	githubLogin: string;
	githubId: string;
	isActive: boolean;
	monthlyAmount: number;
	isOneTimePayment: boolean;
}
