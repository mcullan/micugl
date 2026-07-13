import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const distRoot = resolve(process.cwd(), process.argv[2] ?? 'dist');

const BUDGETS = [
    { file: 'embed.mjs', gzipBudget: 1800 },
    { file: 'embed.global.js', gzipBudget: 1900 }
];

const EXPORT_TARGETS = ['embed.js', 'embed/index.d.ts'];

const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT = /(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const matchAll = (source, pattern) => {
    const specifiers = [];
    let match;
    while ((match = pattern.exec(source)) !== null) {
        specifiers.push(match[1]);
    }
    pattern.lastIndex = 0;
    return specifiers;
};

const importedSpecifiers = source => [
    ...matchAll(source, FROM_SPECIFIER),
    ...matchAll(source, BARE_IMPORT),
    ...matchAll(source, DYNAMIC_IMPORT)
];

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
    const imports = importedSpecifiers(source);

    if (imports.length > 0) {
        failures.push(
            `${file} imports ${imports.join(', ')}, so it is a re-export shim rather than the runtime itself. `
            + 'Gzipping it would measure the shim and pass no matter how large the runtime grew. Keep the embed '
            + 'runtime a single self-contained module (src/embed/index.ts) with no static, bare or dynamic '
            + 'imports.'
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

for (const file of EXPORT_TARGETS) {
    if (!existsSync(resolve(distRoot, file))) {
        failures.push(
            `${file} was not emitted, but package.json maps the micugl/embed export at it, so the subpath would `
            + 'resolve to nothing (or ship untyped) with a green build.'
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
