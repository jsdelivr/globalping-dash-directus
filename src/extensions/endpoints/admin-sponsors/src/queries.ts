import type { Knex } from 'knex';
import { SOURCE_ID_TO_TARGET_ID } from '../../../lib/src/add-credits.js';
import type {
	AccountsQuery,
	EventsQuery,
	ManualAddition,
	ManualAdditionsQuery,
	PageResult,
	SponsorAccount,
	SponsorsChartPoint,
	SponsorsPeriodRange,
	SponsorsSummary,
	SponsorshipEvent,
	SponsorshipReason,
} from './types.js';

export const SPONSORSHIP_REASONS: SponsorshipReason[] = [ 'recurring_sponsorship', 'one_time_sponsorship', 'tier_changed' ];

type AdditionMeta = {
	amountInDollars?: number;
	monthsCovered?: number;
	manual?: boolean;
	comment?: string;
};

type SponsorshipEventRow = {
	id: number;
	date_created: string | Date;
	github_id: string;
	github_login: string | null;
	dashboard_user_id: string | null;
	dashboard_username: string | null;
	reason: SponsorshipReason;
	meta: string | AdditionMeta;
};

export type ManualAdditionRow = {
	id: number;
	date_created: string | Date;
	github_id: string;
	github_login: string | null;
	dashboard_user_id: string | null;
	dashboard_username: string | null;
	added_by: string | null;
	amount: string | number;
	reason: 'one_time_sponsorship' | 'other';
	meta: string | AdditionMeta;
};

type SponsorsChartRow = {
	month: string;
	recurring_value: string | number | null;
	one_time_value: string | number | null;
	events: string | number;
};

export type SponsorAccountRow = {
	github_id: string;
	github_login: string | null;
	dashboard_user_id: string | null;
	dashboard_username: string | null;
	is_active: string | number;
	has_recurring: string | number;
	current_monthly_amount: string | number | null;
	period_sponsorship_value: string | number;
	period_events: string | number;
	latest_event: string | Date;
};

const sponsorshipValueSql = (alias = 'additions') => `
	COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.meta, '$.amountInDollars')) AS DECIMAL(18,2)), 0)
	* CASE
		WHEN ${alias}.reason = 'recurring_sponsorship'
		THEN COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.meta, '$.monthsCovered')) AS UNSIGNED), 1)
		ELSE 1
	END`;

export const utcMonthSql = (column: string) => `DATE_FORMAT(CONVERT_TZ(${column}, @@session.time_zone, '+00:00'), '%Y-%m')`;

const canonicalGithubId = (database: Knex) => {
	const entries = Object.entries(SOURCE_ID_TO_TARGET_ID);
	const cases = entries.map(() => 'WHEN ? THEN ?').join(' ');
	const bindings = entries.flatMap(([ source, target ]) => [ source, target ]);
	return database.raw(`CASE sponsors.github_id ${cases} ELSE sponsors.github_id END AS github_id`, bindings);
};

const currentSponsorsQuery = (database: Knex) => {
	const mappedSponsors = database('sponsors')
		.select(canonicalGithubId(database), 'sponsors.github_login', 'sponsors.monthly_amount');

	return database.from(mappedSponsors.as('mapped_sponsors'))
		.select('mapped_sponsors.github_id')
		.max({ github_login: 'mapped_sponsors.github_login' })
		.max({ monthly_amount: 'mapped_sponsors.monthly_amount' })
		.groupBy('mapped_sponsors.github_id');
};

const periodEventsQuery = (database: Knex, range: SponsorsPeriodRange) => database('gp_credits_additions as additions')
	.whereIn('additions.reason', SPONSORSHIP_REASONS)
	.where('additions.date_created', '>=', range.from)
	.where('additions.date_created', '<', range.to);

export const applySearch = (query: Knex.QueryBuilder, search: string | undefined) => {
	if (!search) {
		return;
	}

	if (/^\d+$/.test(search)) {
		query.where('additions.github_id', search);
		return;
	}

	const value = `%${search}%`;
	query.where((builder) => {
		builder.where('additions.github_id', 'like', value)
			.orWhere('current_sponsors.github_login', 'like', value)
			.orWhere('directus_users.github_username', 'like', value);
	});
};

export const applyManualSearch = (query: Knex.QueryBuilder, search: string | undefined, addedBySql: string) => {
	if (!search) {
		return;
	}

	if (/^\d+$/.test(search)) {
		query.where('additions.github_id', search);
		return;
	}

	const value = `%${search}%`;
	query.where((builder) => {
		builder.where('additions.github_id', 'like', value)
			.orWhere('current_sponsors.github_login', 'like', value)
			.orWhere('dashboard_users.github_username', 'like', value)
			.orWhereRaw(`JSON_UNQUOTE(JSON_EXTRACT(additions.meta, '$.comment')) LIKE ?`, [ value ])
			.orWhereRaw(`${addedBySql} LIKE ?`, [ value ]);
	});
};

const toNumber = (value: string | number | null | undefined): number => {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
};

const parseMeta = (meta: string | AdditionMeta): AdditionMeta => {
	if (typeof meta === 'string') {
		return JSON.parse(meta) as AdditionMeta;
	}

	return meta;
};

export const normalizeSponsorshipEvent = (row: SponsorshipEventRow): SponsorshipEvent => {
	const meta = parseMeta(row.meta);
	const amountInDollars = toNumber(meta.amountInDollars);
	const monthsCovered = row.reason === 'recurring_sponsorship' ? toNumber(meta.monthsCovered) || 1 : 1;

	return {
		id: row.id,
		date: new Date(row.date_created).toISOString(),
		githubId: row.github_id,
		githubLogin: row.github_login,
		dashboardUserId: row.dashboard_user_id,
		dashboardUsername: row.dashboard_username,
		reason: row.reason,
		manual: meta.manual === true,
		amountInDollars,
		monthsCovered,
		sponsorshipValue: amountInDollars * monthsCovered,
	};
};

export const normalizeManualAddition = (row: ManualAdditionRow): ManualAddition => {
	const meta = parseMeta(row.meta);

	return {
		id: row.id,
		date: new Date(row.date_created).toISOString(),
		githubId: row.github_id,
		githubLogin: row.github_login,
		dashboardUserId: row.dashboard_user_id,
		dashboardUsername: row.dashboard_username,
		addedBy: row.added_by,
		type: row.reason === 'one_time_sponsorship' ? 'payment' : 'other',
		credits: toNumber(row.amount),
		amountInDollars: row.reason === 'one_time_sponsorship' ? toNumber(meta.amountInDollars) : null,
		comment: row.reason === 'other' ? meta.comment || null : null,
	};
};

export const fillChartPoints = (monthKeys: string[], rows: SponsorsChartRow[]): SponsorsChartPoint[] => {
	const rowsByMonth = new Map(rows.map(row => [ row.month, row ]));

	return monthKeys.map((month) => {
		const row = rowsByMonth.get(month);

		return {
			month,
			recurringValue: toNumber(row?.recurring_value),
			oneTimeValue: toNumber(row?.one_time_value),
			events: toNumber(row?.events),
		};
	});
};

export const normalizeSponsorAccount = (row: SponsorAccountRow): SponsorAccount => ({
	githubId: row.github_id,
	githubLogin: row.github_login,
	dashboardUserId: row.dashboard_user_id,
	dashboardUsername: row.dashboard_username,
	status: toNumber(row.is_active) ? 'active' : toNumber(row.has_recurring) ? 'former' : 'one-time',
	currentMonthlyAmount: row.current_monthly_amount === null ? null : toNumber(row.current_monthly_amount),
	periodSponsorshipValue: toNumber(row.period_sponsorship_value),
	periodEvents: toNumber(row.period_events),
	latestEvent: new Date(row.latest_event).toISOString(),
});

export const getSponsorsSummary = async (database: Knex, range: SponsorsPeriodRange, now = new Date()): Promise<SponsorsSummary> => {
	const previousMonthTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const previousMonthFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
	const valueSql = sponsorshipValueSql();

	const overviewQuery = database('sponsors').select(
		database.raw('COUNT(*) AS active_sponsors'),
		database.raw('COALESCE(SUM(monthly_amount), 0) AS estimated_next_month_value'),
	).first();
	const previousMonthQuery = database('gp_credits_additions as additions')
		.whereIn('additions.reason', SPONSORSHIP_REASONS)
		.where('additions.date_created', '>=', previousMonthFrom)
		.where('additions.date_created', '<', previousMonthTo)
		.select(
			database.raw(`COALESCE(SUM(${valueSql}), 0) AS total_value`),
			database.raw(`COALESCE(SUM(CASE WHEN additions.reason IN ('recurring_sponsorship', 'tier_changed') THEN ${valueSql} ELSE 0 END), 0) AS recurring_value`),
			database.raw(`COALESCE(SUM(CASE WHEN additions.reason = 'one_time_sponsorship' THEN ${valueSql} ELSE 0 END), 0) AS one_time_value`),
		).first();
	const aggregateQuery = (selectedRange?: SponsorsPeriodRange) => {
		const query = database('gp_credits_additions as additions').whereIn('additions.reason', SPONSORSHIP_REASONS);

		if (selectedRange) {
			query.where('additions.date_created', '>=', selectedRange.from).where('additions.date_created', '<', selectedRange.to);
		}

		return query.select(
			database.raw('COUNT(DISTINCT additions.github_id) AS sponsors'),
			database.raw(`COALESCE(SUM(${valueSql}), 0) AS sponsorship_value`),
			database.raw(`COALESCE(SUM(CASE WHEN additions.reason IN ('recurring_sponsorship', 'tier_changed') THEN ${valueSql} ELSE 0 END), 0) AS recurring_value`),
			database.raw(`COALESCE(SUM(CASE WHEN additions.reason = 'one_time_sponsorship' THEN ${valueSql} ELSE 0 END), 0) AS one_time_value`),
		).first();
	};
	const allTimeQuery = database('gp_credits_additions as additions')
		.whereIn('additions.reason', SPONSORSHIP_REASONS)
		.countDistinct({ sponsors: 'additions.github_id' })
		.first();
	const chartMonthSql = utcMonthSql('additions.date_created');
	const chartQuery = periodEventsQuery(database, range).select(
		database.raw(`${chartMonthSql} AS month`),
		database.raw(`COALESCE(SUM(CASE WHEN additions.reason IN ('recurring_sponsorship', 'tier_changed') THEN ${valueSql} ELSE 0 END), 0) AS recurring_value`),
		database.raw(`COALESCE(SUM(CASE WHEN additions.reason = 'one_time_sponsorship' THEN ${valueSql} ELSE 0 END), 0) AS one_time_value`),
		database.raw('COUNT(*) AS events'),
	).groupByRaw(chartMonthSql)
		.orderBy('month');

	const [ overview, previousMonth, period, allTime, chart ] = await Promise.all([
		overviewQuery,
		previousMonthQuery,
		aggregateQuery(range),
		allTimeQuery,
		chartQuery,
	]);

	return {
		overview: {
			activeSponsors: toNumber(overview?.active_sponsors),
			previousMonth: {
				totalValue: toNumber(previousMonth?.total_value),
				recurringValue: toNumber(previousMonth?.recurring_value),
				oneTimeValue: toNumber(previousMonth?.one_time_value),
			},
			estimatedNextMonthValue: toNumber(overview?.estimated_next_month_value),
		},
		period: {
			sponsors: toNumber(period?.sponsors),
			sponsorshipValue: toNumber(period?.sponsorship_value),
			recurringValue: toNumber(period?.recurring_value),
			oneTimeValue: toNumber(period?.one_time_value),
		},
		allTime: {
			sponsors: toNumber(allTime?.sponsors),
		},
		chart: fillChartPoints(range.monthKeys, chart as SponsorsChartRow[]),
	};
};

export const getManualAdditions = async (database: Knex, query: ManualAdditionsQuery): Promise<PageResult<ManualAddition>> => {
	const addedBySql = `COALESCE(
		NULLIF(TRIM(CONCAT_WS(' ', added_by_users.first_name, added_by_users.last_name)), ''),
		added_by_users.github_username,
		added_by_users.email
	)`;
	const base = database('gp_credits_additions as additions')
		.whereIn('additions.reason', [ 'one_time_sponsorship', 'other' ])
		.whereRaw(`JSON_UNQUOTE(JSON_EXTRACT(additions.meta, '$.manual')) = 'true'`)
		.leftJoin(currentSponsorsQuery(database).as('current_sponsors'), 'current_sponsors.github_id', 'additions.github_id')
		.leftJoin('directus_users as dashboard_users', 'dashboard_users.external_identifier', 'additions.github_id')
		.leftJoin('directus_users as added_by_users', 'added_by_users.id', 'additions.user_updated');

	if (query.types?.length === 1) {
		base.where('additions.reason', query.types[0] === 'payment' ? 'one_time_sponsorship' : 'other');
	}

	applyManualSearch(base, query.search, addedBySql);

	const sortExpressions: Record<ManualAdditionsQuery['sort'], string> = {
		date: 'additions.date_created',
		sponsor: 'COALESCE(current_sponsors.github_login, dashboard_users.github_username, additions.github_id)',
		type: 'additions.reason',
		credits: 'additions.amount',
		addedBy: addedBySql,
	};
	const [ countRow, rows ] = await Promise.all([
		base.clone().clearSelect().clearOrder().count({ total: 'additions.id' }).first(),
		base.clone().select(
			'additions.id',
			'additions.date_created',
			'additions.github_id',
			database.raw('COALESCE(current_sponsors.github_login, dashboard_users.github_username) AS github_login'),
			database.raw('dashboard_users.id AS dashboard_user_id'),
			database.raw('dashboard_users.github_username AS dashboard_username'),
			database.raw(`${addedBySql} AS added_by`),
			'additions.amount',
			'additions.reason',
			'additions.meta',
		).orderByRaw(`${sortExpressions[query.sort]} ${query.direction}`).orderBy('additions.id', 'desc')
			.offset(query.offset).limit(query.limit),
	]);

	return {
		items: (rows as ManualAdditionRow[]).map(normalizeManualAddition),
		total: toNumber(countRow?.total),
	};
};

export const getSponsorshipEvents = async (database: Knex, range: SponsorsPeriodRange, query: EventsQuery): Promise<PageResult<SponsorshipEvent>> => {
	const valueSql = sponsorshipValueSql();
	const base = periodEventsQuery(database, range)
		.leftJoin(currentSponsorsQuery(database).as('current_sponsors'), 'current_sponsors.github_id', 'additions.github_id')
		.leftJoin('directus_users', 'directus_users.external_identifier', 'additions.github_id');

	if (query.types?.length) {
		base.whereIn('additions.reason', query.types);
	}

	applySearch(base, query.search);
	const sortExpressions: Record<EventsQuery['sort'], string> = {
		date: 'additions.date_created',
		sponsor: 'COALESCE(current_sponsors.github_login, directus_users.github_username, additions.github_id)',
		type: 'additions.reason',
		sponsorshipValue: `(${valueSql})`,
	};

	const [ countRow, rows ] = await Promise.all([
		base.clone().clearSelect().clearOrder().count({ total: 'additions.id' }).first(),
		base.clone().select(
			'additions.id',
			'additions.date_created',
			'additions.github_id',
			database.raw('COALESCE(current_sponsors.github_login, directus_users.github_username) AS github_login'),
			database.raw('directus_users.id AS dashboard_user_id'),
			database.raw('directus_users.github_username AS dashboard_username'),
			'additions.reason',
			'additions.meta',
		).orderByRaw(`${sortExpressions[query.sort]} ${query.direction}`).orderBy('additions.id', 'desc')
			.offset(query.offset).limit(query.limit),
	]);

	return {
		items: (rows as SponsorshipEventRow[]).map(normalizeSponsorshipEvent),
		total: toNumber(countRow?.total),
	};
};

export const getSponsorAccounts = async (database: Knex, range: SponsorsPeriodRange, query: AccountsQuery): Promise<PageResult<SponsorAccount>> => {
	const valueSql = sponsorshipValueSql();
	const periodAccounts = periodEventsQuery(database, range).select(
		'additions.github_id',
		database.raw(`SUM(${valueSql}) AS period_sponsorship_value`),
		database.raw('COUNT(*) AS period_events'),
		database.raw('MAX(additions.date_created) AS latest_event'),
	).groupBy('additions.github_id');
	const recurringHistory = database('gp_credits_additions as history')
		.whereIn('history.reason', SPONSORSHIP_REASONS)
		.select('history.github_id')
		.max({ has_recurring: database.raw(`CASE WHEN history.reason IN ('recurring_sponsorship', 'tier_changed') THEN 1 ELSE 0 END`) })
		.groupBy('history.github_id');
	const base = database.from(periodAccounts.as('additions'))
		.leftJoin(currentSponsorsQuery(database).as('current_sponsors'), 'current_sponsors.github_id', 'additions.github_id')
		.leftJoin(recurringHistory.as('history'), 'history.github_id', 'additions.github_id')
		.leftJoin('directus_users', 'directus_users.external_identifier', 'additions.github_id');

	applySearch(base, query.search);

	if (query.statuses?.length) {
		const conditions: string[] = [];

		if (query.statuses.includes('active')) { conditions.push('current_sponsors.github_id IS NOT NULL'); }

		if (query.statuses.includes('former')) { conditions.push('(current_sponsors.github_id IS NULL AND history.has_recurring = 1)'); }

		if (query.statuses.includes('one-time')) { conditions.push('(current_sponsors.github_id IS NULL AND COALESCE(history.has_recurring, 0) = 0)'); }

		base.whereRaw(`(${conditions.join(' OR ')})`);
	}

	if (query.linked !== undefined) {
		base.whereRaw(`directus_users.id IS ${query.linked ? 'NOT ' : ''}NULL`);
	}

	const sortExpressions: Record<AccountsQuery['sort'], string> = {
		sponsor: 'COALESCE(current_sponsors.github_login, directus_users.github_username, additions.github_id)',
		status: `CASE
			WHEN current_sponsors.github_id IS NOT NULL THEN 0
			WHEN COALESCE(history.has_recurring, 0) = 1 THEN 1
			ELSE 2
		END`,
		currentMonthly: 'current_sponsors.monthly_amount',
		periodValue: 'additions.period_sponsorship_value',
		events: 'additions.period_events',
		latestEvent: 'additions.latest_event',
	};

	const [ countRow, rows ] = await Promise.all([
		base.clone().clearSelect().clearOrder().count({ total: 'additions.github_id' }).first(),
		base.clone().select(
			'additions.github_id',
			database.raw('COALESCE(current_sponsors.github_login, directus_users.github_username) AS github_login'),
			database.raw('directus_users.id AS dashboard_user_id'),
			database.raw('directus_users.github_username AS dashboard_username'),
			database.raw('IF(current_sponsors.github_id IS NULL, 0, 1) AS is_active'),
			database.raw('COALESCE(history.has_recurring, 0) AS has_recurring'),
			database.raw('current_sponsors.monthly_amount AS current_monthly_amount'),
			'additions.period_sponsorship_value',
			'additions.period_events',
			'additions.latest_event',
		).orderByRaw(`${sortExpressions[query.sort]} ${query.direction}`).orderBy('additions.github_id')
			.offset(query.offset).limit(query.limit),
	]);

	return {
		items: (rows as SponsorAccountRow[]).map(normalizeSponsorAccount),
		total: toNumber(countRow?.total),
	};
};
