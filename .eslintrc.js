module.exports = {
  env: {
    browser: true,
    node: true,
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
  },
};
