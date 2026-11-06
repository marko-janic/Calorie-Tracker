// Flat ESLint config for Expo SDK 58 with ESLint 9
// https://docs.expo.dev/guides/using-eslint/

const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*'],
  },
];
