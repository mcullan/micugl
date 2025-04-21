import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                types: resolve(__dirname, 'src/types-entry.ts'),
                'examples/index': resolve(__dirname, 'examples/index.ts'),
                'examples/Marble/MarbleScene': resolve(__dirname, 'examples/Marble/MarbleScene.tsx'),
                'examples/Marble/marbleShaders': resolve(__dirname, 'examples/Marble/marbleShaders.ts'),
                'examples/Ripple/RippleScene': resolve(__dirname, 'examples/Ripple/RippleScene.tsx'),
                'examples/Ripple/rippleShaders': resolve(__dirname, 'examples/Ripple/rippleShaders.ts')
            },
            formats: ['es', 'cjs'],
            fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'js'}`
        },
        rollupOptions: {
            external: [
                'react',
                'react-dom', 
                'react/jsx-runtime',
                /^react\/.*/
            ],
            output: {
                exports: 'named',
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM'
                },
                preserveModules: true,
                preserveModulesRoot: '.'
            }
        }
    },
    plugins: [dts({
        include: ['src/**', 'examples/**'],
        rollupTypes: true,
        staticImport: true,
        insertTypesEntry: true,
        copyDtsFiles: true
    })],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        }
    }
});
