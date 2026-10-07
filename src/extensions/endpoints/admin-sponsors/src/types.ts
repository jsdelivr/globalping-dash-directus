export type SponsorsPeriod = 'past-year' | `${number}`;

export type SponsorsPeriodRange = {
	from: Date;
	to: Date;
	monthKeys: string[];
};

export type SponsorshipReason = 'recurring_sponsorship' | 'one_time_sponsorship' | 'tier_changed';
export type ManualAdditionType = 'payment' | 'other';

export type SponsorStatus = 'active' | 'former' | 'one-time';
export type SortDirection = 'asc' | 'desc';
export type SponsorshipEventSort = 'date' | 'sponsor' | 'type' | 'sponsorshipValue';
export type SponsorAccountSort = 'sponsor' | 'status' | 'currentMonthly' | 'periodValue' | 'events' | 'latestEvent';
export type ManualAdditionSort = 'date' | 'sponsor' | 'type' | 'credits' | 'addedBy';

export type PageResult<T> = {
	items: T[];
	total: number;
};

export type SponsorsChartPoint = {
	month: string;
	recurringValue: number;
	oneTimeValue: number;
	events: number;
};

export type SponsorsSummary = {
	overview: {
		activeSponsors: number;
		previousMonth: {
			totalValue: number;
			recurringValue: number;
			oneTimeValue: number;
		};
		estimatedNextMonthValue: number;
	};
	period: {
		sponsors: number;
		sponsorshipValue: number;
		recurringValue: number;
		oneTimeValue: number;
	};
	allTime: {
		sponsors: number;
	};
	chart: SponsorsChartPoint[];
};

export type SponsorshipEvent = {
	id: number;
	date: string;
	githubId: string;
	githubLogin: string | null;
	dashboardUserId: string | null;
	dashboardUsername: string | null;
	reason: SponsorshipReason;
	manual: boolean;
	amountInDollars: number;
	monthsCovered: number;
	sponsorshipValue: number;
};

export type ManualAddition = {
	id: number;
	date: string;
	githubId: string;
	githubLogin: string | null;
	dashboardUserId: string | null;
	dashboardUsername: string | null;
	addedBy: string | null;
	type: ManualAdditionType;
	credits: number;
	amountInDollars: number | null;
	comment: string | null;
};

export type SponsorAccount = {
	githubId: string;
	githubLogin: string | null;
	dashboardUserId: string | null;
	dashboardUsername: string | null;
	status: SponsorStatus;
	currentMonthlyAmount: number | null;
	periodSponsorshipValue: number;
	periodEvents: number;
	latestEvent: string;
};

export type EventsQuery = {
	period: SponsorsPeriod;
	offset: number;
	limit: number;
	search?: string;
	types?: SponsorshipReason[];
	sort: SponsorshipEventSort;
	direction: SortDirection;
};

export type AccountsQuery = {
	period: SponsorsPeriod;
	offset: number;
	limit: number;
	search?: string;
	statuses?: SponsorStatus[];
	linked?: boolean;
	sort: SponsorAccountSort;
	direction: SortDirection;
};

export type ManualAdditionsQuery = {
	offset: number;
	limit: number;
	search?: string;
	types?: ManualAdditionType[];
	sort: ManualAdditionSort;
	direction: SortDirection;
};
