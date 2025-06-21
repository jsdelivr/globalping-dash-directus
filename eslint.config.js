import { defineConfig } from 'eslint/config';
import typescript from '@martin-kolarik/eslint-config/typescript.js';
import typescriptTypeChecked from '@martin-kolarik/eslint-config/typescript-type-checked.js';
import eslintImport from 'eslint-plugin-import';
import eslintVue from 'eslint-plugin-vue';

export default defineConfig([
	typescriptTypeChecked.forFiles([ [ 'src/**/src/**/*.ts', '!src/extensions/lib/src/*.ts' ] ]),
	typescript.forFiles([ '**/*.ts', '**/*.vue' ]),
	eslintVue.configs['flat/recommended'],
	{
		ignores: [
			'**/dist',
			'/extensions',
			'**/shims.d.ts',
			'src/extensions/*/*/lib',
			'test/e2e/globalping-dash',
			'test-results',
		],
	},
	{
		plugins: {
			import: eslintImport,
		},

		rules: {
			'n/no-missing-import': [
				'error',
				{
					allowModules: [
						'@directus/types',
					],
				},
			],
			'vue/html-indent': [
				'error',
				'tab',
				{
					baseIndent: 1,
				},
			],
			'vue/script-indent': [
				'error',
				'tab',
				{
					baseIndent: 1,
				},
			],
			'vue/html-closing-bracket-spacing': [
				'error',
				{
					selfClosingTag: 'never',
				},
			],
			'vue/max-attributes-per-line': [ 'error', {
				singleline: {
					max: 5,
				},
				multiline: {
					max: 1,
				},
			}],
			'vue/multi-word-component-names': 'off',
			'vue/singleline-html-element-content-newline': 'off',
		},
	},
	{
		files: [
			'src/**/*.ts',
		],
		ignores: [
			'src/extensions/lib/src/*.ts',
		],
		languageOptions: {
			parserOptions: {
				project: true,
			},
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'import/order': [ 'error', {
				alphabetize: {
					order: 'asc',
				},
			}],
		},
	},
	{
		files: [
			[ 'src/**/src/**/*.ts', '!src/extensions/lib/src/*.ts' ],
		],
		rules: {
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-misused-promises': 'off',
			'@typescript-eslint/no-floating-promises': 'error',
		},
	},
	{
		files: [
			'src/**/*.vue',
		],
		languageOptions: {
			parserOptions: {
				parser: '@typescript-eslint/parser',
			},
		},
		rules: {
			'@stylistic/indent': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
	{
		files: [
			'src/**/test/**',
		],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
]);
