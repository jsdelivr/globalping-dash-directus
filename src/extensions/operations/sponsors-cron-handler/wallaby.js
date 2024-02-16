export default function wallaby () {
	return {
		testFramework: 'mocha',
		files: [
			'src/**/*.ts',
			'package.json',
			'test/*.json',
		],
		tests: [
			'test/**/*.test.ts',
		],

		env: {
			type: 'node',
			params: {
				runner: '--experimental-specifier-resolution=node',
				env: 'NODE_ENV=test',
			},
		},
		preprocessors: {
			'**/*.ts': file => file.content.replace(/\.ts/g, '.js'),
		},
		workers: { restart: true, initial: 1, regular: 1 },
	};
}
