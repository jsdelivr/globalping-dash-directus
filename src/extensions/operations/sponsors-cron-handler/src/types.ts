export type DirectusSponsor = {
	id: number;
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
