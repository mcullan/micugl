import { afterEach, describe, expect, it } from 'vitest';

import {
    emitEngineMount,
    emitEngineUnmount,
    type EngineHandle,
    listEngines,
    setDevtoolsSink
} from '@/react/devtools/beacon';

const emptyCapabilities = {
    floatRenderable: false,
    halfFloatRenderable: false,
    floatLinearFilterable: false,
    halfFloatLinearFilterable: false,
    halfFloatType: 0
};

function createHandle(id: string): EngineHandle {
    return {
        id,
        kind: 'shader',
        getManager: () => null,
        getState: () => ({
            kind: 'shader',
            id,
            canvas: { renderWidth: 0, renderHeight: 0, displayWidth: 0, displayHeight: 0 },
            programIds: [],
            framebufferIds: [],
            capabilities: emptyCapabilities,
            floatFilterDowngraded: false
        })
    };
}

afterEach(() => {
    setDevtoolsSink(null);
    for (const handle of listEngines()) {
        emitEngineUnmount(handle.id);
    }
});

describe('beacon registry', () => {
    it('mount adds the engine to listEngines, unmount removes it', () => {
        const handle = createHandle('engine-a');
        emitEngineMount(handle);

        expect(listEngines()).toEqual([handle]);

        emitEngineUnmount('engine-a');

        expect(listEngines()).toEqual([]);
    });

    it('setDevtoolsSink replays already-mounted engines to a late-mounting sink', () => {
        const handle = createHandle('engine-a');
        emitEngineMount(handle);

        const mounted: EngineHandle[] = [];
        setDevtoolsSink({ onMount: h => { mounted.push(h) }, onUnmount: () => undefined });

        expect(mounted).toEqual([handle]);
    });

    it('an attached sink receives onMount and onUnmount as engines register', () => {
        const mounted: EngineHandle[] = [];
        const unmounted: string[] = [];
        setDevtoolsSink({
            onMount: h => { mounted.push(h) },
            onUnmount: id => { unmounted.push(id) }
        });

        const handle = createHandle('engine-a');
        emitEngineMount(handle);
        emitEngineUnmount('engine-a');

        expect(mounted).toEqual([handle]);
        expect(unmounted).toEqual(['engine-a']);
    });

    it('a late-mounting sink discovers engines mounted before it attached', () => {
        emitEngineMount(createHandle('engine-a'));
        emitEngineMount(createHandle('engine-b'));

        const mountedIds: string[] = [];
        setDevtoolsSink({ onMount: h => { mountedIds.push(h.id) }, onUnmount: () => undefined });

        expect(mountedIds.sort()).toEqual(['engine-a', 'engine-b']);
    });

    it('double-unmount of the same id is safe and idempotent', () => {
        emitEngineMount(createHandle('engine-a'));
        emitEngineUnmount('engine-a');

        expect(() => { emitEngineUnmount('engine-a') }).not.toThrow();
        expect(listEngines()).toEqual([]);
    });

    it('unmounting an id that was never mounted is safe', () => {
        expect(() => { emitEngineUnmount('never-mounted') }).not.toThrow();
        expect(listEngines()).toEqual([]);
    });

    it('setDevtoolsSink(null) detaches the sink so later mounts are not observed', () => {
        const mountedIds: string[] = [];
        setDevtoolsSink({ onMount: h => { mountedIds.push(h.id) }, onUnmount: () => undefined });
        setDevtoolsSink(null);

        emitEngineMount(createHandle('engine-a'));

        expect(mountedIds).toEqual([]);
        expect(listEngines().map(h => h.id)).toEqual(['engine-a']);
    });
});
