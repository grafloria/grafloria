/* eslint-disable */
export default {
  displayName: 'react',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(nanoid|uuid)/)'],
  moduleNameMapper: {
    '^nanoid$': '<rootDir>/../engine/src/__mocks__/nanoid.ts',
    '^uuid$': '<rootDir>/../engine/src/__mocks__/uuid.ts',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: '../../coverage/libs/react',
};
