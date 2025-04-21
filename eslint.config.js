import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactX from 'eslint-plugin-react-x';
import reactDom from 'eslint-plugin-react-dom';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      {
        languageOptions: {
          parserOptions: {
            projectService: true,
            tsconfigRootDir: __dirname,
            project: ['./tsconfig.json']
          },
        },
      },
      ...tseslint.configs.stylisticTypeChecked,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-x': reactX,
      'react-dom': reactDom,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'indent': ['error', 4, {
        SwitchCase: 1,
        ignoredNodes: [
          'TemplateLiteral *',
          'JSXElement',
          'JSXElement > *',
          'JSXAttribute',
          'JSXIdentifier',
          'JSXNamespacedName',
          'JSXMemberExpression',
          'JSXSpreadAttribute',
          'JSXExpressionContainer',
          'JSXOpeningElement',
          'JSXClosingElement',
          'JSXFragment',
          'JSXOpeningFragment',
          'JSXClosingFragment',
          'JSXText',
          'JSXEmptyExpression',
          'JSXSpreadChild'
        ]
      }],
      semi: ['error', 'always', { omitLastInOneLineBlock: true }],
      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'jsx-quotes': ['error', 'prefer-single'],
      'eol-last': ['error', 'always'],
      'no-restricted-imports': ['error', {
        paths: [],
        patterns: [
          { 
            group: ['../*', '../../*'], 
            message: 'Use absolute imports instead of relative imports outside current directory' 
          }
        ]
      }],

      ...reactHooks.configs.recommended.rules,
      ...reactX.configs['recommended-typescript'].rules,
      ...reactDom.configs.recommended.rules,

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/restrict-template-expressions': 'off',
      'react-x/no-context-provider': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'simple-import-sort/imports': ['error', {
        groups: [
          ['^node:'],
          ['^react', '^react-dom'],
          ['^@?\\w'],
          ['^(@)(/.*|$)'],
          ['^type\\s'],
          ['^\\u0000'],
          ['^.+\\.s?css$'],
        ],
      }],
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [],
        patterns: [
          { 
            group: ['../*', '../../*'], 
            message: 'Use absolute imports instead of relative imports outside current directory' 
          }
        ]
      }]
    }
  },
  {
    files: ['examples/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [],
        patterns: [
          { 
            group: ['../*', '../../*'], 
            message: 'Use absolute imports instead of relative imports outside current directory' 
          }
        ]
      }]
    }
  },
  {
    files: ['vite.config.ts'],
    languageOptions: {
      parserOptions: {
        allowDefaultProject: true
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
  }
);
