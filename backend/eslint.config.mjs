import eslintNestJs from '@darraghor/eslint-plugin-nestjs-typed';
import dr460nf1r3, { testFiles } from '@dr460nf1r3/eslint-rules';
import tsParser from '@typescript-eslint/parser';
import baseConfig from '../eslint.config.mjs';

const languageOptions = {
  parser: tsParser,
  parserOptions: {
    projectService: {
      allowDefaultProject: ['src/repo-manager/test/*.ts'],
    },
    tsconfigRootDir: import.meta.dirname,
  },
};

export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts'],
    languageOptions,
  },
  ...dr460nf1r3.configs['type-checked'].map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
  })),
  ...eslintNestJs.configs.flatRecommended.map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts', 'src/test/**/*.ts', 'src/repo-manager/test/**/*.ts'],
    languageOptions: {
      ...config.languageOptions,
      ...languageOptions,
    },
  })),
  {
    files: ['src/**/*.ts'],
    rules: {
      '@darraghor/nestjs-typed/injectable-should-be-provided': 'off',
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.d.ts', ...testFiles],
    rules: {
      '@dr460nf1r3/file-suffix': ['warn', { ignore: ['/src/auth/generated/'] }],
    },
  },
];
