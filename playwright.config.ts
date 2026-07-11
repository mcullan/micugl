import { execSync } from 'node:child_process';

import { defineConfig, devices } from '@playwright/test';

const sha = execSync('git rev-parse HEAD', { cwd: process.cwd() }).toString().trim();

const PORT = 5599;
const baseURL = `http://localhost:${PORT}`;

const timingProject = {
    name: 'timing',
    use: { ...devices['Desktop Chrome'], headless: false }
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
        baseURL
    },
    webServer: {
        command: `bunx vite --config demo/vite.config.ts --port ${String(PORT)} --strictPort --no-open`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
    },
    projects: [
        {
            name: 'counters',
            use: { ...devices['Desktop Chrome'], headless: true }
        },
        ...(process.env.CI ? [] : [timingProject])
    ]
});
