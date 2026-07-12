import { resolve } from 'node:path';

import { defineConfig } from 'vite';

import { assertWorkerIsReactFree } from './vite.workerPlugins';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        target: 'es2020',
        minify: 'esbuild',
        lib: {
            entry: resolve(__dirname, 'src/worker/workerEntry.ts'),
            formats: ['es'],
            fileName: () => 'worker.mjs'
        },
        rollupOptions: {
            external: [],
            output: {
                preserveModules: false,
                inlineDynamicImports: true
            }
        }
    },
    resolve: {
        alias: { '@': resolve(__dirname, 'src') }
    },
    plugins: [assertWorkerIsReactFree()]
});
