import dr460nf1r3 from '@dr460nf1r3/eslint-rules';
import nx from '@nx/eslint-plugin';
import baseConfig from '../eslint.config.mjs';

const typeCheckedConfigs = [...dr460nf1r3.configs['type-checked'], ...dr460nf1r3.configs['angular-type-checked']];

export default [
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    ignores: ['**/public/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'chaotic',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'chaotic',
          style: 'kebab-case',
        },
      ],
    },
  },
  ...dr460nf1r3.configs.angular,
  ...typeCheckedConfigs.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
];
