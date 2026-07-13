/* eslint-disable */
export default {
  displayName: 'element',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(nanoid|uuid)/)'],
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/../engine/src/__mocks__/nanoid.ts',
    '^uuid$': '<rootDir>/../engine/src/__mocks__/uuid.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/element',
};
