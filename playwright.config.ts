import { execSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

import { BUILT_PORT, BUILT_URL, DEV_PORT, DEV_URL } from './e2e/servers';

const sha = execSync('git rev-parse HEAD', { cwd: process.cwd() }).toString().trim();

const e2e = process.env.MICUGL_E2E === '1';

const timingProject = {
    name: 'timing',
    use: { ...devices['Desktop Chrome'], headless: false }
};

const e2eProject = {
    name: 'e2e',
    testDir: './e2e',
    use: { ...devices['Desktop Chrome'], headless: true }
};

const devServer = {
    command: `bunx vite --config demo/vite.config.ts --port ${String(DEV_PORT)} --strictPort --no-open`,
    url: DEV_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
};

const builtDemoServer = {
    command: 'bunx vite build --config demo/vite.config.ts'
        + ` && bunx vite preview --config demo/vite.config.ts --port ${String(BUILT_PORT)} --strictPort`,
    url: BUILT_URL,
    reuseExistingServer: false,
    timeout: 120_000
};

export default defineConfig({
    testDir: './bench',
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    timeout: 60_000,
    reporter: [['list']],
    metadata: { sha },
    use: {
        baseURL: DEV_URL
    },
    webServer: e2e ? [devServer, builtDemoServer] : [devServer],
    projects: [
        {
            name: 'counters',
            use: { ...devices['Desktop Chrome'], headless: true }
        },
        ...(process.env.CI ? [] : [timingProject]),
        ...(e2e ? [e2eProject] : [])
    ]
});
