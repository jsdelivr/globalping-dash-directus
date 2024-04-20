import anyAscii from 'any-ascii';

const cities: Record<string, string> = {
	'Geneve': 'Geneva',
	'Frankfurt am Main': 'Frankfurt',
	'New York City': 'New York',
	'Santiago de Queretaro': 'Queretaro',
	'Nurnberg': 'Nuremberg',
};

export const normalizeCityName = (name: string): string => {
	// We don't add city to the regex as there are valid names like 'Mexico City' or 'Kansas City'
	const asciiName = anyAscii(name).replace(/(?:\s+|^)the(?:\s+|$)/gi, '');
	return cities[asciiName] ?? asciiName;
};
