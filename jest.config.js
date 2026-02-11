module.exports = {
  testMatch: [
    '<rootDir>/packages/*/src/**/__tests__/**/*.test.js',
    '<rootDir>/scripts/__tests__/**/*.test.js',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/server/'],
  transform: {},
};
