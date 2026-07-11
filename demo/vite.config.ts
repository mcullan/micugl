import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    root: __dirname,
    plugins: [react()],
    optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client']
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, '../src')
        }
    },
    server: {
        port: 3000,
        open: true
    }
});
