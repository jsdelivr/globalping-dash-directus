export default function wallaby () {
	return {
		testFramework: 'mocha',
		files: [
			'src/**/*.ts',
			'lib/**/*.ts',
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
			'**/*.ts': file => file.content
				.replaceAll('.ts', '.js')
				.replaceAll('../../../lib/src/', '../lib/'),
		},
		workers: { restart: true, initial: 1, regular: 1 },
	};
}
