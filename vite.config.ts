import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                core:  resolve(__dirname, 'src/core/index.ts'),
                react: resolve(__dirname, 'src/react/index.ts'),
                testing: resolve(__dirname, 'src/testing/index.ts'),
                devtools: resolve(__dirname, 'src/react/devtools/index.ts'),
            },
            formats: ['es','cjs'],
            fileName: (format, entry) =>
        `${entry}.${format === 'es' ? 'mjs' : 'js'}`
        },
        rollupOptions: {
            external: ['react','react-dom','react/jsx-runtime',/^react\/.*/,/^react-dom\/.*/],
            output: {
                preserveModules:       true,
                preserveModulesRoot:   'src',
                globals: { react: 'React', 'react-dom': 'ReactDOM' }
            },
        }
    },
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    plugins: [
        dts({
            tsconfigPath:  './tsconfig.json',
            outDir:             'dist',
            entryRoot:         'src',
            exclude: ['**/*.test.ts', '**/*.test.tsx'],
        })
    ]
});
