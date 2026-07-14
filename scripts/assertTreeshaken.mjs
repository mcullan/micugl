import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const distRoot = resolve(process.cwd(), process.argv[2] ?? 'dist');
const ENTRIES = ['index.mjs', 'core.mjs', 'react.mjs'].map(name => resolve(distRoot, name));
const CREATE_WORKER = resolve(distRoot, 'worker', 'createWorker.mjs');
const SUBPATH_WORKER = resolve(distRoot, 'worker.mjs');

const WORKER_BODY_MARKER = 'one worker runtime drives exactly one canvas';

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

const resolveModule = (fromFile, specifier) => {
    if (!specifier.startsWith('.')) {
        return null;
    }
    const base = resolve(dirname(fromFile), specifier);
    const candidates = [base, `${base}.mjs`, resolve(base, 'index.mjs')];
    return candidates.find(candidate => existsSync(candidate)) ?? null;
};

const collectStaticSpecifiers = source => [
    ...matchAll(source, FROM_SPECIFIER),
    ...matchAll(source, BARE_IMPORT)
];

const listModules = directory => {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const full = resolve(directory, entry);
        if (statSync(full).isDirectory()) {
            files.push(...listModules(full));
        } else if (entry.endsWith('.mjs')) {
            files.push(full);
        }
    }
    return files;
};

const reachable = new Set();
const queue = [...ENTRIES];

while (queue.length > 0) {
    const file = queue.pop();
    if (reachable.has(file) || !existsSync(file)) {
        continue;
    }
    reachable.add(file);
    const source = readFileSync(file, 'utf8');
    for (const specifier of collectStaticSpecifiers(source)) {
        const resolved = resolveModule(file, specifier);
        if (resolved !== null && !reachable.has(resolved)) {
            queue.push(resolved);
        }
    }
}

const DEVTOOLS_PREFIX = `react${sep}devtools${sep}`;
const EFFECTS_PREFIX = `effects${sep}`;
const failures = [];
const rel = file => relative(distRoot, file);

for (const file of reachable) {
    const name = rel(file);
    if (name.startsWith(DEVTOOLS_PREFIX) && !name.endsWith(`${sep}beacon.mjs`)) {
        failures.push(`devtools panel module reachable from a main bundle: ${name}`);
    }
    if (name === 'effects.mjs' || name.startsWith(EFFECTS_PREFIX)) {
        failures.push(`effects module reachable from a main bundle: ${name}`);
    }
    if (name === 'testing.mjs' || name.startsWith(`testing${sep}`)) {
        failures.push(`testing module reachable from a main bundle: ${name}`);
    }
    if (readFileSync(file, 'utf8').includes(WORKER_BODY_MARKER)) {
        failures.push(`the inlined worker body is statically reachable from a main bundle: ${name}`);
    }
}

const emittedWorkerChunks = existsSync(distRoot)
    ? listModules(distRoot)
        .filter(file => file !== SUBPATH_WORKER)
        .filter(file => readFileSync(file, 'utf8').includes(WORKER_BODY_MARKER))
    : [];

if (emittedWorkerChunks.length === 0) {
    failures.push(
        'no chunk carrying the inlined worker body was emitted; the blob-worker path has no worker to '
        + 'construct. It should be emitted as a dynamic-import chunk of worker/createWorker.mjs.'
    );
}

const dynamicallyImported = existsSync(CREATE_WORKER)
    ? matchAll(readFileSync(CREATE_WORKER, 'utf8'), DYNAMIC_IMPORT)
        .map(specifier => resolveModule(CREATE_WORKER, specifier))
        .filter(file => file !== null)
    : [];

for (const chunk of emittedWorkerChunks) {
    if (!dynamicallyImported.includes(chunk)) {
        failures.push(
            `the inlined worker chunk ${rel(chunk)} is not dynamically imported by worker/createWorker.mjs; `
            + 'it must be reached through import() so it stays out of the main entry graph.'
        );
    }

    const source = readFileSync(chunk, 'utf8');
    const imports = [
        ...collectStaticSpecifiers(source),
        ...matchAll(source, DYNAMIC_IMPORT)
    ];
    if (imports.length > 0 || source.includes('importScripts')) {
        failures.push(
            `the inlined worker chunk ${rel(chunk)} is not self-contained (it imports ${imports.join(', ')}); `
            + 'a worker constructed from a blob URL cannot import anything.'
        );
    }
}

if (!existsSync(SUBPATH_WORKER)) {
    failures.push('worker.mjs was not emitted; the micugl/worker export would 404.');
}

if (failures.length > 0) {
    console.error('assertTreeshaken: the dist layout of index/core/react is wrong:');
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    console.error('Only react/devtools/beacon.mjs may be statically reachable; the panel, testing and');
    console.error('inlined-worker chunks must be reached via dynamic import() or an explicit subpath import.');
    process.exit(1);
}

console.log(
    `assertTreeshaken: walked ${String(reachable.size)} modules from index/core/react; no devtools panel, `
    + `testing or inlined-worker module is statically reachable, and the worker chunk `
    + `(${emittedWorkerChunks.map(rel).join(', ')}) is self-contained and reached only through import().`
);
