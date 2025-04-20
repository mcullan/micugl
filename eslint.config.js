import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import rootConfig from '../../../eslint.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
  ...rootConfig,
  {
    files: ['lib/shaders/src/**/*.{ts,tsx}'],
    rules: {
      'simple-import-sort/imports': ['error', {
        groups: [
          ['^node:'],
          ['^react', '^react-dom'],
          ['^@?\\w'],
          ['^(_shaders)(/.*|$)'],
          ['^(_shader-examples)(/.*|$)'],
          ['^type\\s'],
          ['^\\u0000'],
          ['^.+\\.s?css$'],
        ],
      }],
      'no-restricted-imports': ['error', {
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
    files: ['lib/shaders/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [],
        pathGroups: [
          {
            pattern: './*',
            group: 'internal'
          }
        ]
      }]
    }
  },
  {
    files: ['lib/shaders/examples/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [],
        pathGroups: [
          {
            pattern: './*',
            group: 'internal'
          }
        ]
      }]
    }
  },
];
