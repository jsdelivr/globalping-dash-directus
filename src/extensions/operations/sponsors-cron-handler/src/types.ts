export type DirectusSponsor = {
	id: number;
	github_login: string;
	github_id: string;
	monthly_amount: number;
	last_earning_date: string;
};

export type GithubSponsor = {
	githubLogin: string;
	githubId: string;
	tierId: string;
	isActive: boolean;
	monthlyAmount: number;
	isOneTimePayment: boolean;
	tierSelectedAt: Date;
};

export type GithubActivity = NewSponsorshipActivity | TierChangeActivity;

type NewSponsorshipActivity = {
	id: string;
	action: 'NEW_SPONSORSHIP';
	timestamp: string;
	sponsor: {
		databaseId: number;
		login: string;
	};
	sponsorsTier: {
		id: string;
		monthlyPriceInDollars: number;
		isOneTime: boolean;
	};
	previousSponsorsTier: null;
};

type TierChangeActivity = {
	id: string;
	action: 'TIER_CHANGE';
	timestamp: string;
	sponsor: {
		databaseId: number;
		login: string;
	};
	sponsorsTier: {
		id: string;
		monthlyPriceInDollars: number;
		isOneTime: boolean;
	};
	previousSponsorsTier: {
		monthlyPriceInDollars: number;
	};
};

export type CreditsAddition = {
	github_id: string;
	reason: string;
	meta: {
		amountInDollars: number;
		tierId: string;
	};
	date_created: string;
};
