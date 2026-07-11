import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const distRoot = resolve(process.cwd(), process.argv[2] ?? 'dist');
const ENTRIES = ['index.mjs', 'core.mjs', 'react.mjs'].map(name => resolve(distRoot, name));

const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT = /(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g;

const resolveModule = (fromFile, specifier) => {
    if (!specifier.startsWith('.')) {
        return null;
    }
    const base = resolve(dirname(fromFile), specifier);
    const candidates = [base, `${base}.mjs`, resolve(base, 'index.mjs')];
    return candidates.find(candidate => existsSync(candidate)) ?? null;
};

const collectSpecifiers = source => {
    const specifiers = [];
    let match;
    while ((match = FROM_SPECIFIER.exec(source)) !== null) {
        specifiers.push(match[1]);
    }
    while ((match = BARE_IMPORT.exec(source)) !== null) {
        specifiers.push(match[1]);
    }
    return specifiers;
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
    for (const specifier of collectSpecifiers(source)) {
        const resolved = resolveModule(file, specifier);
        if (resolved !== null && !reachable.has(resolved)) {
            queue.push(resolved);
        }
    }
}

const DEVTOOLS_PREFIX = `react${sep}devtools${sep}`;
const failures = [];

for (const file of reachable) {
    const rel = relative(distRoot, file);
    if (rel.startsWith(DEVTOOLS_PREFIX) && !rel.endsWith(`${sep}beacon.mjs`)) {
        failures.push(`devtools panel module reachable from a main bundle: ${rel}`);
    }
    if (rel === 'testing.mjs' || rel.startsWith(`testing${sep}`)) {
        failures.push(`testing module reachable from a main bundle: ${rel}`);
    }
}

if (failures.length > 0) {
    console.error('assertTreeshaken: static import graph of index/core/react leaked a dev-only module:');
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    console.error('Only react/devtools/beacon.mjs may be statically reachable; the panel and testing');
    console.error('chunks must be reached via dynamic import() or an explicit micugl/devtools import.');
    process.exit(1);
}

console.log(`assertTreeshaken: walked ${String(reachable.size)} modules from index/core/react; no devtools panel or testing module is statically reachable.`);
