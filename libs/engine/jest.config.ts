/* eslint-disable */
export default {
  displayName: 'engine',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(nanoid|uuid|lemonadejs)/)'
  ],
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/src/__mocks__/nanoid.ts',
    '^uuid$': '<rootDir>/src/__mocks__/uuid.ts',
    '^lemonadejs$': '<rootDir>/src/__mocks__/lemonadejs.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/engine',
};
