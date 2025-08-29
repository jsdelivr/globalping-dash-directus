import Bluebird from 'bluebird';
import _ from 'lodash';
import { countries } from 'countries-list';

export async function up (knex) {
	const TABLE_NAME = 'gp_probes';
	const stateIsoToName = _.invert(states);
	const countryToRegionMap = new Map(_.flatMap(regions, (v, r) => v.map(c => [ c, r ])));

	const probes = await knex(TABLE_NAME)
		.select('id', 'country', 'continent', 'state')
		.whereNull('countryName')
		.orWhereNull('continent')
		.orWhereNull('continentName')
		.orWhereNull('region')
		.orWhere(function () {
			this.whereNotNull('state').whereNull('stateName');
		});

	const allUpdates = new Map();

	for (const probe of probes) {
		const updates = {};

		if (!probe.countryName) {
			updates.countryName = countries[probe.country].name;
		}

		if (!probe.continent || !probe.continentName) {
			updates.continent = countries[probe.country].continent;
			updates.continentName = continents[updates.continent];
		}

		if (!probe.region) {
			updates.region = countryToRegionMap.get(probe.country);
		}

		if (!probe.stateName && probe.state) {
			updates.stateName = stateIsoToName[probe.state];
		}

		if (Object.keys(updates).length > 0) {
			allUpdates.set(probe.id, updates);
		}
	}

	await Bluebird.map(allUpdates.entries(), async ([ id, updates ]) => {
		await knex(TABLE_NAME).where('id', id).update(updates);
	}, { concurrency: 8 });

	console.log('Empty locations columns filled');
}

export async function down () {
	console.log('There is no down operation for that migration.');
}

const states = {
	'Alabama': 'AL',
	'Alaska': 'AK',
	'American Samoa': 'AS',
	'Arizona': 'AZ',
	'Arkansas': 'AR',
	'California': 'CA',
	'Colorado': 'CO',
	'Connecticut': 'CT',
	'Delaware': 'DE',
	'Washington, D.C.': 'DC',
	'District of Columbia': 'DC',
	'Florida': 'FL',
	'Georgia': 'GA',
	'Guam': 'GU',
	'Hawaii': 'HI',
	'Idaho': 'ID',
	'Illinois': 'IL',
	'Indiana': 'IN',
	'Iowa': 'IA',
	'Kansas': 'KS',
	'Kentucky': 'KY',
	'Louisiana': 'LA',
	'Maine': 'ME',
	'Marshall Islands': 'MH',
	'Maryland': 'MD',
	'Massachusetts': 'MA',
	'Michigan': 'MI',
	'Minnesota': 'MN',
	'Mississippi': 'MS',
	'Missouri': 'MO',
	'Montana': 'MT',
	'Nebraska': 'NE',
	'Nevada': 'NV',
	'New Hampshire': 'NH',
	'New Jersey': 'NJ',
	'New Mexico': 'NM',
	'New York': 'NY',
	'North Carolina': 'NC',
	'North Dakota': 'ND',
	'Northern Mariana Islands': 'MP',
	'Ohio': 'OH',
	'Oklahoma': 'OK',
	'Oregon': 'OR',
	'Palau': 'PW',
	'Pennsylvania': 'PA',
	'Puerto Rico': 'PR',
	'Rhode Island': 'RI',
	'South Carolina': 'SC',
	'South Dakota': 'SD',
	'Tennessee': 'TN',
	'Texas': 'TX',
	'Utah': 'UT',
	'Vermont': 'VT',
	'Virgin Islands': 'VI',
	'Virginia': 'VA',
	'Washington': 'WA',
	'West Virginia': 'WV',
	'Wisconsin': 'WI',
	'Wyoming': 'WY',
};

const regions = {
	'Northern Africa': [ 'DZ', 'EG', 'LY', 'MA', 'SD', 'TN', 'EH' ],
	'Eastern Africa': [ 'BI', 'KM', 'DJ', 'ER', 'ET', 'KE', 'MG', 'MW', 'MU', 'MZ', 'RW', 'SC', 'SO', 'SS', 'TZ', 'UG', 'ZM', 'ZW', 'RE', 'TF', 'YT' ],
	'Middle Africa': [ 'AO', 'CM', 'CF', 'TD', 'CG', 'CD', 'GQ', 'GA', 'ST' ],
	'Southern Africa': [ 'BW', 'LS', 'NA', 'ZA', 'SZ' ],
	'Western Africa': [ 'BJ', 'BF', 'CV', 'GM', 'GH', 'GN', 'GW', 'CI', 'LR', 'ML', 'MR', 'NE', 'NG', 'SN', 'SL', 'TG', 'SH' ],

	'Caribbean': [ 'AG', 'BS', 'BB', 'CU', 'DM', 'DO', 'GD', 'HT', 'JM', 'KN', 'LC', 'VC', 'TT', 'GP', 'KY', 'MQ', 'MS', 'TC', 'AW', 'VG', 'VI', 'PR', 'AI', 'MF', 'BL', 'SX', 'CW', 'BQ' ],
	'Central America': [ 'BZ', 'CR', 'SV', 'GT', 'HN', 'MX', 'NI', 'PA' ],
	'South America': [ 'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'GY', 'PY', 'PE', 'SR', 'UY', 'VE', 'FK', 'GF', 'GS' ],
	'Northern America': [ 'CA', 'US', 'BM', 'GL', 'PM' ],

	'Central Asia': [ 'KZ', 'KG', 'TJ', 'TM', 'UZ' ],
	'Eastern Asia': [ 'CN', 'JP', 'KP', 'KR', 'MN', 'HK', 'TW', 'MO' ],
	'South-eastern Asia': [ 'BN', 'MM', 'KH', 'TL', 'ID', 'LA', 'MY', 'PH', 'SG', 'TH', 'VN' ],
	'Southern Asia': [ 'AF', 'BD', 'BT', 'IN', 'IR', 'MV', 'NP', 'PK', 'LK', 'IO' ],
	'Western Asia': [ 'BH', 'IQ', 'IL', 'JO', 'KW', 'LB', 'OM', 'QA', 'SA', 'SY', 'TR', 'AE', 'YE', 'AM', 'AZ', 'CY', 'GE', 'PS' ],

	'Eastern Europe': [ 'RU', 'BY', 'BG', 'CZ', 'HU', 'MD', 'PL', 'RO', 'SK', 'UA', 'XK' ],
	'Northern Europe': [ 'DK', 'EE', 'FI', 'IS', 'IE', 'LV', 'LT', 'NO', 'SE', 'GB', 'FO', 'GG', 'SJ', 'AX' ],
	'Southern Europe': [ 'AL', 'AD', 'BA', 'HR', 'GR', 'IT', 'MK', 'MT', 'ME', 'PT', 'SM', 'RS', 'SI', 'ES', 'VA', 'GI' ],
	'Western Europe': [ 'AT', 'BE', 'FR', 'DE', 'LI', 'LU', 'MC', 'NL', 'CH', 'JE', 'IM' ],

	'Australia and New Zealand': [ 'AU', 'NZ', 'NF' ],
	'Melanesia': [ 'FJ', 'PG', 'SB', 'VU', 'NC' ],
	'Micronesia': [ 'KI', 'MH', 'FM', 'NR', 'PW', 'MP', 'GU' ],
	'Polynesia': [ 'WS', 'TO', 'TV', 'CK', 'NU', 'PF', 'PN', 'TK', 'WF' ],
};

const continents = {
	EU: 'Europe',
	NA: 'North America',
	SA: 'South America',
	AS: 'Asia',
	OC: 'Oceania',
	AF: 'Africa',
	AN: 'Antarctica',
};
