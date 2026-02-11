module.exports = {
  projects: [
    // Unit tests (existing)
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/packages/*/src/**/__tests__/**/*.test.js',
        '<rootDir>/scripts/__tests__/**/*.test.js',
      ],
      testPathIgnorePatterns: ['/node_modules/', '/server/'],
      transform: {},
    },
    // Fantom integration tests
    {
      displayName: 'fantom',
      runner: '<rootDir>/packages/fantom/src/runner/jest-runner.js',
      testMatch: [
        '<rootDir>/packages/*/src/**/*-itest.js',
        '<rootDir>/tests/integration/**/*-itest.js',
      ],
      testPathIgnorePatterns: ['/node_modules/', '/server/'],
    },
  ],
};
