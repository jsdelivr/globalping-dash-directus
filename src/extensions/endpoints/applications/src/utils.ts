export const validateUrl = (value: string | null) => {
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value);

		if ([ 'http:', 'https:' ].includes(url.protocol)) {
			return value;
		}

		return null;
	} catch {
		return null;
	}
};
