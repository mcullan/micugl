import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                'examples/index': resolve(__dirname, 'examples/index.ts'),
                'examples/Marble/index': resolve(__dirname, 'examples/Marble/index.ts'),
                'examples/SimpleRipple/index': resolve(__dirname, 'examples/SimpleRipple/index.ts')
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
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM'
                }
            }
        }
    },
    plugins: [dts({
        include: ['src/**', 'examples/**'],
        rollupTypes: true
    })],
    resolve: {
        alias: {
            '_shaders': resolve(__dirname, 'src'),
            '_shader-examples': resolve(__dirname, 'examples'),
        }
    }
});
