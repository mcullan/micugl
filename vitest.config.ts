import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    include: ['src/**/*.test.ts'],
                    environment: 'node'
                }
            },
            {
                extends: true,
                test: {
                    name: 'dom',
                    include: ['src/**/*.test.tsx'],
                    environment: 'jsdom'
                }
            }
        ]
    }
});
