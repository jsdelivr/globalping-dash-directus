export type DirectusSponsor = {
	id: number;
	github_login: string;
	github_id: string;
	monthly_amount: number;
	last_earning_date: string;
}

export type GithubSponsor = {
	githubLogin: string;
	githubId: string;
	isActive: boolean;
	monthlyAmount: number;
	isOneTimePayment: boolean;
}
