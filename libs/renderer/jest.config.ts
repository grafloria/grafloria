/* eslint-disable */
export default {
  displayName: 'renderer',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom', // Use jsdom for document.createElement
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(nanoid|uuid)/)'
  ],
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/../engine/src/__mocks__/nanoid.ts',
    '^uuid$': '<rootDir>/../engine/src/__mocks__/uuid.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/renderer',
};
