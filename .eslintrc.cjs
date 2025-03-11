module.exports = {
    env: {
      browser: true,
      node: true,
      es2022: true,
    },
    parser: '@babel/eslint-parser',
    extends: ['airbnb-base', 'plugin:prettier/recommended'],
    rules: {
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      'import/no-unresolved': 'off',
      'import/prefer-default-export': 'off',
      'import/order': 'off',
      'prettier/prettier': 'off',
      'no-console': 'off',
      // Add Vite-specific rules
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          js: 'never',
          mjs: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never',
        },
      ],
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
  };