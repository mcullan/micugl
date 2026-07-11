import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORBIDDEN_SYMBOLS = ['installInstrumentation', 'createGLStub'];
const TARGET_FILES = ['dist/index.mjs', 'dist/core.mjs', 'dist/react.mjs'];

const failures = [];

for (const targetFile of TARGET_FILES) {
    const path = resolve(process.cwd(), targetFile);
    const contents = readFileSync(path, 'utf8');
    for (const symbol of FORBIDDEN_SYMBOLS) {
        if (contents.includes(symbol)) {
            failures.push(`${targetFile} contains testing-only symbol "${symbol}"`);
        }
    }
}

if (failures.length > 0) {
    console.error('assertTreeshaken: micugl/testing leaked into a main bundle:');
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    console.error('src/testing/** must never be imported by src/index.ts, src/core/index.ts, or src/react/index.ts.');
    process.exit(1);
}

console.log('assertTreeshaken: main bundles are clean of testing-only symbols.');
