import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const distRoot = resolve(process.cwd(), process.argv[2] ?? 'dist');

const BUDGETS = [
    { file: 'embed.mjs', gzipBudget: 1800 },
    { file: 'embed.global.js', gzipBudget: 1900 }
];

const RELATIVE_IMPORT = /\bfrom\s*['"]\.|(?:^|[;\n])\s*import\s*['"]\./;

const failures = [];
const measured = [];

for (const { file, gzipBudget } of BUDGETS) {
    const path = resolve(distRoot, file);

    if (!existsSync(path)) {
        failures.push(`${file} was not emitted, so the micugl/embed size budget guards nothing.`);
        continue;
    }

    const bytes = readFileSync(path);
    const source = bytes.toString('utf8');

    if (RELATIVE_IMPORT.test(source)) {
        failures.push(
            `${file} statically imports another module, so it is a re-export shim rather than the runtime `
            + 'itself. Gzipping it would measure the shim and pass no matter how large the runtime grew. Keep '
            + 'the embed runtime a single self-contained module (src/embed/index.ts) with no imports.'
        );
    }

    const gzipSize = gzipSync(bytes, { level: 9 }).length;
    measured.push(`${file}: ${gzipSize} B gzip / ${bytes.length} B raw (budget ${gzipBudget} B gzip)`);

    if (gzipSize > gzipBudget) {
        failures.push(
            `${file} is ${gzipSize} B gzip, which is ${gzipSize - gzipBudget} B over its ${gzipBudget} B budget. `
            + 'The embed runtime exists because reusing WebGLManager costs ~4.4 KB gzip for a fullscreen quad; a '
            + 'runtime that drifts back toward that size has lost its reason to exist. Cut bytes rather than '
            + 'raising the budget.'
        );
    }
}

if (failures.length > 0) {
    console.error('checkEmbedSize: the micugl/embed artifacts do not meet their budget:');
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

console.log(`checkEmbedSize: ${measured.join('; ')}`);
