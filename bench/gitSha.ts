import { execSync } from 'node:child_process';

export const gitSha = execSync('git rev-parse HEAD', { cwd: process.cwd() })
    .toString()
    .trim();
