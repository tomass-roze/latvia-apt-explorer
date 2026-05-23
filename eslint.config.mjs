import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Force the scoring engine to stay isomorphic (no Node, no React, no Next).
  {
    files: ['lib/scoring/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'lib/scoring/* must stay isomorphic (no React).' },
            { name: 'next/headers', message: 'lib/scoring/* must stay isomorphic (no Next).' },
            { name: 'server-only', message: 'lib/scoring/* must stay isomorphic (no server-only).' },
            { name: 'client-only', message: 'lib/scoring/* must stay isomorphic (no client-only).' },
          ],
          patterns: [
            { group: ['node:*'], message: 'lib/scoring/* must stay isomorphic (no Node built-ins).' },
            { group: ['fs', 'fs/*', 'path', 'crypto'], message: 'lib/scoring/* must stay isomorphic (no Node built-ins).' },
            { group: ['react', 'react-dom'], message: 'lib/scoring/* must stay isomorphic (no React).' },
            { group: ['react/*', 'react-dom/*'], message: 'lib/scoring/* must stay isomorphic (no React).' },
          ],
        },
      ],
    },
  },

  // Force per-developer scrapers to use shared infrastructure.
  {
    files: ['scrapers/*/**/*.ts'],
    ignores: ['scrapers/base/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'node-fetch', message: 'Use scrapers/base/fetch.ts (polite UA, retry, robots-parser).' },
            { name: 'undici', message: 'Use scrapers/base/fetch.ts.' },
            {
              name: '@/scrapers/base/geocoder/janas-seta',
              message: 'Import from @/scrapers/base/geocoder instead — uses the fallback chain.',
            },
            {
              name: '@/scrapers/base/geocoder/nominatim',
              message: 'Import from @/scrapers/base/geocoder instead — uses the fallback chain.',
            },
          ],
          patterns: [
            {
              group: ['node:https', 'node:http'],
              message: 'Use scrapers/base/fetch.ts.',
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'node_modules/**',
    'data/**',
  ]),
]);

export default eslintConfig;
