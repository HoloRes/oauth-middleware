module.exports = {
	env: {
		es2021: true,
		node: true,
	},
	extends: [
		'airbnb-base',
		'airbnb-typescript/base',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 12,
		sourceType: 'module',
		project: './tsconfig.eslint.json',
	},
	plugins: [
		'@typescript-eslint',
	],
	ignorePatterns: ['**/*.d.ts'],
	rules: {
		indent: 'off',
		'@typescript-eslint/indent': ['error', 'tab'],
		'no-tabs': 'off',
		'consistent-return': 'off', // Disabled as returns are not required
		'no-underscore-dangle': 'off', // Disabled as mongoose uses _id,
		'no-plusplus': ['error', {
			allowForLoopAfterthoughts: true,
		}],
		'import/extensions': 'off',
	},
};
