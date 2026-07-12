import type { Plugin } from 'vite';

const REACT_SPECIFIER = /^react(?:$|[/-])/;

export function assertWorkerIsReactFree(): Plugin {
    return {
        name: 'micugl-worker-no-react',
        enforce: 'pre',
        resolveId(source, importer) {
            if (REACT_SPECIFIER.test(source)) {
                throw new Error(
                    `micugl worker build: the worker bundle must not depend on React, but "${source}" was `
                    + `imported by ${importer ?? 'the worker entry'}. Keep worker-side code in React-free `
                    + 'modules.'
                );
            }
            return null;
        }
    };
}
