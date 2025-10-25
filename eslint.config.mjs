import nx from '@nx/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  ...jsdoc.configs['flat/recommended-mixed'],
  {
    ignores: ['**/dist', '**/node_modules'],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['variable', 'parameter'],
          modifiers: ['destructured'],
          format: null,
        },
        {
          selector: ['class', 'typeLike'],
          format: ['PascalCase'],
        },
        {
          selector: ['function', 'method'],
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'variableLike',
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
      ],
    },
  },
];
