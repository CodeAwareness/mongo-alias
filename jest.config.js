module.exports = {
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  restoreMocks: true,
  coveragePathIgnorePatterns: ['node_modules', 'src/config', 'src/app.js', 'tests'],
  coverageReporters: ['text', 'lcov', 'clover', 'html', 'json'],
  watchPathIgnorePatterns: ['dist'],
  moduleNameMapper: {
    '@/(.*)': '<rootDir>/src/$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ["ts", "tsx", "js"],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json"
    }
  },
  testMatch: [
    "**/*.test.(ts|tsx|js)"
  ],
}
