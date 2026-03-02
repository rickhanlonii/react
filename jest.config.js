module.exports = {
  watchman: false,
  projects: [
    // Unit tests
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/packages/react-dom-native/src/**/__tests__/**/*.test.js',
        '<rootDir>/example/scripts/__tests__/**/*.test.js',
      ],
      testPathIgnorePatterns: ['/node_modules/', '/server/'],
      transform: {},
    },
    // Fantom integration tests
    {
      displayName: 'fantom',
      runner: '<rootDir>/tools/fantom/src/runner/jest-runner.js',
      testMatch: [
        '<rootDir>/packages/react-dom-native/src/**/*-itest.js',
        '<rootDir>/tests/integration/**/*-itest.js',
      ],
      testPathIgnorePatterns: ['/node_modules/', '/server/'],
    },
    // Server tests (Fizz / SSR)
    {
      displayName: 'server',
      testMatch: [
        '<rootDir>/packages/react-dom-native/src/server/__tests__/**/*.test.js',
      ],
      testPathIgnorePatterns: ['/node_modules/'],
      transform: {},
    },
  ],
};
