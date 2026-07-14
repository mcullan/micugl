import { describe, expect, it } from 'vitest';

import type { InvalidationKind } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import { vec2 } from '@/core/lib/vectorUtils';
import { createUniformRuntime } from '@/react/lib/uniformRuntime';
import type { UniformParam, UniformUpdaterDef } from '@/types';

function names(updaters: UniformUpdaterDef[]): string[] {
    return updaters.map(updater => updater.name);
}

function updater(updaters: UniformUpdaterDef[], name: string): UniformUpdaterDef {
    const found = updaters.find(entry => entry.name === name);
    if (!found) {
        throw new Error(`no updater named ${name}`);
    }
    return found;
}

describe('createUniformRuntime: the updater array identity', () => {
    it('is stable while the structure holds and fresh when a descriptor name or type changes', () => {
        const runtime = createUniformRuntime();

        const first = runtime.sync({ swirl: { type: 'float', value: 0.25 } }, false);
        const second = runtime.sync({ swirl: { type: 'float', value: 0.9 } }, false);
        expect(second).toBe(first);

        const renamed = runtime.sync({ twist: { type: 'float', value: 0.9 } }, false);
        expect(renamed).not.toBe(first);
        expect(names(renamed)).toContain('u_twist');

        const retyped = runtime.sync({ twist: { type: 'vec2', value: vec2([1, 2]) } }, false);
        expect(retyped).not.toBe(renamed);
        expect(updater(retyped, 'u_twist').type).toBe('vec2');
    });

    it('samples the live value through the stable array, so a value change still reaches the updater', () => {
        const runtime = createUniformRuntime();

        const updaters = runtime.sync({ swirl: { type: 'float', value: 0.25 } }, false);
        runtime.commit({ swirl: { type: 'float', value: 0.25 } }, 'none');
        expect(updater(updaters, 'u_swirl').updateFn(0, 10, 10)).toBe(0.25);

        runtime.sync({ swirl: { type: 'float', value: 0.75 } }, false);
        runtime.commit({ swirl: { type: 'float', value: 0.75 } }, 'none');
        expect(updater(updaters, 'u_swirl').updateFn(0, 10, 10)).toBe(0.75);
    });
});

describe('createUniformRuntime: skipDefaultUniforms is a per-sync argument', () => {
    it('rebuilds the updaters with and without the injected u_time when the flag flips between calls', () => {
        const runtime = createUniformRuntime();
        const uniforms: Record<string, UniformParam> = { swirl: { type: 'float', value: 0.25 } };

        const withDefaults = runtime.sync(uniforms, false);
        expect(names(withDefaults)).toEqual(['u_time', 'u_resolution', 'u_swirl']);

        const withoutDefaults = runtime.sync(uniforms, true);
        expect(names(withoutDefaults)).toEqual(['u_swirl']);

        const backAgain = runtime.sync(uniforms, false);
        expect(names(backAgain)).toEqual(['u_time', 'u_resolution', 'u_swirl']);
        expect(updater(backAgain, 'u_time').updateFn(2500, 10, 10)).toBe(2.5);
    });
});

describe('createUniformRuntime: the invalidation relay', () => {
    it('forwards a continuous request with its kind intact, and a discrete one as discrete', () => {
        const runtime = createUniformRuntime();
        const source = createFrameInvalidation();
        const uniforms: Record<string, UniformParam> = {
            level: { type: 'float', value: 0.5, invalidation: source }
        };

        const kinds: InvalidationKind[] = [];
        runtime.invalidation.connect(kind => { kinds.push(kind) });

        runtime.sync(uniforms, false);
        runtime.commit(uniforms, 'none');

        source.request('continuous');
        source.request('discrete');
        source.request();

        expect(kinds).toEqual(['continuous', 'discrete', 'discrete']);
    });

    it('disconnects every relay on dispose, so a later request reaches no listener', () => {
        const runtime = createUniformRuntime();
        const source = createFrameInvalidation();
        const uniforms: Record<string, UniformParam> = {
            level: { type: 'float', value: 0.5, invalidation: source }
        };

        const kinds: InvalidationKind[] = [];
        runtime.invalidation.connect(kind => { kinds.push(kind) });

        runtime.sync(uniforms, false);
        runtime.commit(uniforms, 'none');
        source.request('continuous');
        expect(kinds).toEqual(['continuous']);

        runtime.dispose();
        source.request('continuous');
        source.request('discrete');

        expect(kinds).toEqual(['continuous']);
    });

    it('drops the relay for a param that goes away, and keeps the one that stays', () => {
        const runtime = createUniformRuntime();
        const staying = createFrameInvalidation();
        const leaving = createFrameInvalidation();

        const kinds: InvalidationKind[] = [];
        runtime.invalidation.connect(kind => { kinds.push(kind) });

        const both: Record<string, UniformParam> = {
            level: { type: 'float', value: 0.5, invalidation: staying },
            beat: { type: 'float', value: 0.5, invalidation: leaving }
        };
        runtime.sync(both, false);
        runtime.commit(both, 'none');

        const only: Record<string, UniformParam> = {
            level: { type: 'float', value: 0.5, invalidation: staying }
        };
        runtime.sync(only, false);
        runtime.commit(only, 'none');

        leaving.request('continuous');
        expect(kinds).toEqual([]);

        staying.request('continuous');
        expect(kinds).toEqual(['continuous']);
    });
});
