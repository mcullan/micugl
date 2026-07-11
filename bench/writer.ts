import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { FrameStats, GlCountersData } from './instrument';

export interface CdpDelta {
    taskDuration: number;
    threadTime: number;
}

export interface SceneConfig {
    measurementMs: number;
    headless: boolean;
    iterations: number | null;
}

export interface SceneProjectResult {
    config: SceneConfig;
    glCounters: GlCountersData;
    frameStats: FrameStats;
    cdp: CdpDelta;
}

export interface ResultsDoc {
    sha: string;
    generatedAt: string;
    scenes: Record<string, Record<string, SceneProjectResult>>;
}

const resultsDir = (): string => resolve(process.cwd(), 'bench-results');

const sortValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(sortValue);
    }
    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort()) {
            out[key] = sortValue(source[key]);
        }
        return out;
    }
    return value;
};

const stableStringify = (doc: ResultsDoc): string => `${JSON.stringify(sortValue(doc), null, 2)}\n`;

export const readResults = (sha: string): ResultsDoc | null => {
    const file = join(resultsDir(), `${sha}.json`);
    if (!existsSync(file)) {
        return null;
    }
    return JSON.parse(readFileSync(file, 'utf8')) as ResultsDoc;
};

export const writeSceneResult = (
    sha: string,
    scene: string,
    project: string,
    result: SceneProjectResult
): void => {
    const dir = resultsDir();
    mkdirSync(dir, { recursive: true });

    const existing = readResults(sha);
    const doc: ResultsDoc = existing ?? { sha, generatedAt: '', scenes: {} };
    doc.sha = sha;
    doc.generatedAt = new Date().toISOString();

    const sceneEntry = doc.scenes[scene] ?? {};
    sceneEntry[project] = result;
    doc.scenes[scene] = sceneEntry;

    writeFileSync(join(dir, `${sha}.json`), stableStringify(doc));
};
