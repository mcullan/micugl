import { describe, expect, it } from 'vitest';

import { validateAudioOptions } from '@/core/lib/audioBands';
import type { InvalidationKind } from '@/core/lib/frameInvalidation';
import type { AudioAnalyserDriverDeps } from '@/react/lib/audioAnalyserDriver';
import { createAudioAnalyserDriver } from '@/react/lib/audioAnalyserDriver';
import type { FakeAnalyser, FakeStream, FakeTrack } from '@/react/lib/fakeWebAudio';
import {
    asContext,
    asElement,
    createFakeStream,
    FakeContext,
    FakeSourceNode,
    HIGH_HALF,
    latestAnalyser,
    LOW_HALF
} from '@/react/lib/fakeWebAudio';
import type { AudioSourceSpec, AudioUniformsOptions } from '@/types';

interface Harness {
    driver: ReturnType<typeof createAudioAnalyserDriver>;
    context: FakeContext;
    tracks: FakeTrack[];
    requests: number[];
    analyser: () => FakeAnalyser;
}

function createHarness(
    options: AudioUniformsOptions = {},
    source: AudioSourceSpec = { type: 'mic' },
    overrides: { context?: FakeContext; deps?: Partial<AudioAnalyserDriverDeps> } = {}
): Harness {
    const context = overrides.context ?? new FakeContext();
    const { stream, tracks } = createFakeStream();
    const requests: number[] = [];

    const driver = createAudioAnalyserDriver(source, validateAudioOptions(options), {
        createContext: () => asContext(context),
        getUserMedia: () => Promise.resolve(stream),
        ...overrides.deps
    });
    driver.invalidation.connect(() => { requests.push(1) });

    return {
        driver,
        context,
        tracks,
        requests,
        analyser: () => latestAnalyser(context)
    };
}

const TWO_BAND_LINEAR: AudioUniformsOptions = {
    bands: 2,
    fftSize: 64,
    bandLayout: 'linear',
    attack: 0.05,
    release: 0.4
};

describe('the audio analyser driver, reading a fake analyser whose spectrum the test controls', () => {
    it('bandsScratch changes across successive frames and tracks the signal that was fed in', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();
        const analyser = harness.analyser();

        analyser.spectrum = LOW_HALF;

        harness.driver.analyseIfNeeded(0);
        expect(Array.from(harness.driver.bandsScratch)).toEqual([0, 0]);

        const lowBand: number[] = [];
        const highBand: number[] = [];
        for (let time = 16; time <= 160; time += 16) {
            harness.driver.analyseIfNeeded(time);
            lowBand.push(harness.driver.bandsScratch[0]);
            highBand.push(harness.driver.bandsScratch[1]);
        }

        expect(analyser.reads).toBe(11);
        expect(lowBand[0]).toBeGreaterThan(0);
        for (let i = 1; i < lowBand.length; i++) {
            expect(lowBand[i]).toBeGreaterThan(lowBand[i - 1]);
        }
        expect(lowBand[lowBand.length - 1]).toBeGreaterThan(0.8);
        expect(lowBand[lowBand.length - 1]).toBeLessThanOrEqual(1);
        expect(highBand.every(value => value === 0)).toBe(true);

        analyser.spectrum = HIGH_HALF;

        const afterSwap: { low: number; high: number }[] = [];
        for (let time = 176; time <= 320; time += 16) {
            harness.driver.analyseIfNeeded(time);
            afterSwap.push({ low: harness.driver.bandsScratch[0], high: harness.driver.bandsScratch[1] });
        }

        for (let i = 1; i < afterSwap.length; i++) {
            expect(afterSwap[i].low).toBeLessThan(afterSwap[i - 1].low);
            expect(afterSwap[i].high).toBeGreaterThan(afterSwap[i - 1].high);
        }
        expect(afterSwap[afterSwap.length - 1].high).toBeGreaterThan(0.8);

        expect(harness.driver.level).toBeCloseTo(
            (harness.driver.bandsScratch[0] + harness.driver.bandsScratch[1]) / 2,
            10
        );
    });

    it('the envelope rises faster than it falls across frames', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();
        const analyser = harness.analyser();

        analyser.spectrum = LOW_HALF;
        harness.driver.analyseIfNeeded(0);
        harness.driver.analyseIfNeeded(16);
        const rise = harness.driver.bandsScratch[0];

        for (let time = 32; time <= 480; time += 16) {
            harness.driver.analyseIfNeeded(time);
        }
        const settled = harness.driver.bandsScratch[0];

        analyser.spectrum = () => 0;
        harness.driver.analyseIfNeeded(496);
        const fall = settled - harness.driver.bandsScratch[0];

        expect(rise).toBeGreaterThan(0);
        expect(fall).toBeGreaterThan(0);
        expect(rise).toBeGreaterThan(fall * 4);
    });

    it('a long gap between frames eases back over 100ms of envelope instead of snapping to the new spectrum', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();
        harness.analyser().spectrum = LOW_HALF;

        harness.driver.analyseIfNeeded(0);
        harness.driver.analyseIfNeeded(10000);

        expect(harness.driver.bandsScratch[0]).toBeCloseTo(1 - Math.exp(-0.1 / 0.05), 6);
        expect(harness.driver.bandsScratch[0]).toBeLessThan(0.9);
    });

    it('a clock that steps backwards is ignored outright: it reads nothing and cannot steal envelope time', async () => {
        const rewound = createHarness(TWO_BAND_LINEAR);
        const control = createHarness(TWO_BAND_LINEAR);
        await rewound.driver.start();
        await control.driver.start();
        rewound.analyser().spectrum = LOW_HALF;
        control.analyser().spectrum = LOW_HALF;

        for (const harness of [rewound, control]) {
            harness.driver.analyseIfNeeded(0);
            harness.driver.analyseIfNeeded(32);
        }
        const settled = rewound.driver.bandsScratch[0];
        expect(settled).toBeGreaterThan(0);
        expect(control.driver.bandsScratch[0]).toBe(settled);

        const readsBefore = rewound.analyser().reads;
        rewound.driver.analyseIfNeeded(16);
        rewound.driver.analyseIfNeeded(32);

        expect(rewound.analyser().reads).toBe(readsBefore);
        expect(rewound.driver.bandsScratch[0]).toBe(settled);

        rewound.driver.analyseIfNeeded(48);
        control.driver.analyseIfNeeded(48);

        expect(rewound.driver.bandsScratch[0]).toBeGreaterThan(settled);
        expect(rewound.driver.bandsScratch[0]).toBe(control.driver.bandsScratch[0]);
        expect(Number.isFinite(rewound.driver.level)).toBe(true);
    });

    it('a non-finite frame time analyses nothing and cannot freeze the driver at NaN', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();
        harness.analyser().spectrum = LOW_HALF;

        harness.driver.analyseIfNeeded(Number.NaN);
        expect(harness.analyser().reads).toBe(0);
        expect(harness.driver.bandsScratch[0]).toBe(0);

        harness.driver.analyseIfNeeded(0);
        harness.driver.analyseIfNeeded(32);
        const settled = harness.driver.bandsScratch[0];
        expect(settled).toBeGreaterThan(0);

        harness.driver.analyseIfNeeded(Number.NaN);
        harness.driver.analyseIfNeeded(Number.POSITIVE_INFINITY);

        expect(harness.driver.bandsScratch[0]).toBe(settled);

        harness.driver.analyseIfNeeded(48);

        expect(harness.driver.bandsScratch[0]).toBeGreaterThan(settled);
        expect(harness.driver.bandsScratch.every(value => Number.isFinite(value))).toBe(true);
        expect(Number.isFinite(harness.driver.level)).toBe(true);
    });

    it('memoizes on frame time: two reads at the same timeMs analyse exactly once', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();
        const analyser = harness.analyser();
        analyser.spectrum = LOW_HALF;

        harness.driver.analyseIfNeeded(100);
        harness.driver.analyseIfNeeded(100);
        harness.driver.analyseIfNeeded(100);

        expect(analyser.reads).toBe(1);

        harness.driver.analyseIfNeeded(116);
        expect(analyser.reads).toBe(2);
    });

    it('a pinned clock does not spin the analyser, and a running frame re-arms the invalidation chain', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();

        expect(harness.requests).toHaveLength(1);

        harness.driver.analyseIfNeeded(50);
        expect(harness.requests).toHaveLength(2);

        harness.driver.analyseIfNeeded(50);
        harness.driver.analyseIfNeeded(50);
        expect(harness.requests).toHaveLength(2);
        expect(harness.analyser().reads).toBe(1);
    });

    it('start() resolves to a running driver and requests exactly one frame to kick the chain', async () => {
        const harness = createHarness();

        expect(harness.driver.status).toBe('idle');
        expect(Array.from(harness.driver.bandsScratch)).toEqual([0, 0, 0, 0]);

        await harness.driver.start();

        expect(harness.driver.status).toBe('running');
        expect(harness.driver.error).toBeNull();
        expect(harness.requests).toHaveLength(1);
        expect(harness.context.resumeCalls).toBe(1);
    });

    it('is inert before start(): the uniforms read a documented zero, and nothing is analysed', () => {
        const harness = createHarness(TWO_BAND_LINEAR);

        harness.driver.analyseIfNeeded(16);
        harness.driver.analyseIfNeeded(32);

        expect(harness.driver.status).toBe('idle');
        expect(Array.from(harness.driver.bandsScratch)).toEqual([0, 0]);
        expect(harness.driver.level).toBe(0);
        expect(harness.context.analysers).toHaveLength(0);
        expect(harness.requests).toHaveLength(0);
    });
});

describe('audio driver lifecycle', () => {
    it('stop() stops every microphone track and closes the context it created', async () => {
        const harness = createHarness();
        await harness.driver.start();

        const analyser = harness.analyser();
        const sourceNode = harness.context.streamSources[0];
        expect(sourceNode.connections).toEqual([analyser]);

        harness.driver.stop();

        expect(harness.tracks.every(track => track.stopped)).toBe(true);
        expect(harness.context.closeCalls).toBe(1);
        expect(harness.driver.status).toBe('stopped');
        expect(sourceNode.connections).toEqual([]);
    });

    it('never routes the microphone to the speakers', async () => {
        const harness = createHarness();
        await harness.driver.start();

        expect(harness.context.streamSources[0].connections)
            .not.toContain(harness.context.destination);
    });

    it('stop() zeroes the bands and repaints, so a stopped visual cannot freeze on the last spectrum', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();
        harness.analyser().spectrum = LOW_HALF;

        harness.driver.analyseIfNeeded(0);
        harness.driver.analyseIfNeeded(200);
        expect(harness.driver.bandsScratch[0]).toBeGreaterThan(0);

        const before = harness.requests.length;
        harness.driver.stop();

        expect(Array.from(harness.driver.bandsScratch)).toEqual([0, 0]);
        expect(harness.driver.level).toBe(0);
        expect(harness.requests.length).toBe(before + 1);
    });

    it('does NOT close a caller-owned context, and does not touch the caller node beyond its own analyser', async () => {
        const context = new FakeContext();
        const node = new FakeSourceNode(context);
        const harness = createHarness(
            {},
            { type: 'node', node: node as unknown as AudioNode, context: asContext(context) },
            { context }
        );

        await harness.driver.start();
        const analyser = harness.analyser();
        expect(node.connections).toEqual([analyser]);

        harness.driver.stop();

        expect(context.closeCalls).toBe(0);
        expect(node.connections).toEqual([]);
        expect(harness.driver.status).toBe('stopped');
    });

    it('throws when the caller-owned context passed with a node source has already been closed', async () => {
        const context = new FakeContext();
        const node = new FakeSourceNode(context);
        await context.close();

        const harness = createHarness(
            {},
            { type: 'node', node: node as unknown as AudioNode, context: asContext(context) },
            { context }
        );

        await expect(harness.driver.start()).rejects.toThrow(/is closed, so no analyser can be built/);

        expect(harness.driver.status).toBe('error');
        expect(context.analysers).toHaveLength(0);
        expect(node.connections).toEqual([]);
    });

    it('throws when a node source is given a context the node does not belong to', async () => {
        const nodeContext = new FakeContext();
        const otherContext = new FakeContext();
        const node = new FakeSourceNode(nodeContext);
        const harness = createHarness(
            {},
            { type: 'node', node: node as unknown as AudioNode, context: asContext(otherContext) }
        );

        await expect(harness.driver.start()).rejects.toThrow(/do not match/);
        expect(harness.driver.status).toBe('error');
    });

    it('a rejected getUserMedia rejects start(), sets status to error, and populates error', async () => {
        const denied = new Error('NotAllowedError: Permission denied');
        const harness = createHarness({}, { type: 'mic' }, {
            deps: { getUserMedia: () => Promise.reject(denied) }
        });

        await expect(harness.driver.start()).rejects.toThrow('NotAllowedError: Permission denied');

        expect(harness.driver.status).toBe('error');
        expect(harness.driver.error).toBe(denied);
        expect(harness.context.analysers).toHaveLength(0);
    });

    it('a failure AFTER the microphone is granted still stops the tracks and closes the context', async () => {
        const context = new FakeContext();
        context.sampleRate = 384000;
        const harness = createHarness({ bands: 4, fftSize: 32 }, { type: 'mic' }, { context });

        await expect(harness.driver.start()).rejects.toThrow(/cannot be\s+split into 4 non-empty/);

        expect(harness.driver.status).toBe('error');
        expect(harness.tracks.every(track => track.stopped)).toBe(true);
        expect(context.closeCalls).toBe(1);
    });

    it('a microphone granted to an attempt that then fails is released before the next attempt grants another', async () => {
        const context = new FakeContext();
        context.sampleRate = 384000;
        const grants: { stream: MediaStream; tracks: { stopped: boolean }[] }[] = [];

        const driver = createAudioAnalyserDriver({ type: 'mic' }, validateAudioOptions({ bands: 4, fftSize: 32 }), {
            createContext: () => asContext(context),
            getUserMedia: () => {
                const grant = createFakeStream();
                grants.push(grant);
                return Promise.resolve(grant.stream);
            }
        });

        await expect(driver.start()).rejects.toThrow(/cannot be\s+split into 4 non-empty/);
        await expect(driver.start()).rejects.toThrow(/cannot be\s+split into 4 non-empty/);

        expect(grants).toHaveLength(2);
        expect(grants.every(grant => grant.tracks.every(track => track.stopped))).toBe(true);
    });

    it('start() after an error retries and can succeed', async () => {
        const { stream, tracks } = createFakeStream();
        const context = new FakeContext();
        let attempt = 0;

        const driver = createAudioAnalyserDriver({ type: 'mic' }, validateAudioOptions(), {
            createContext: () => asContext(context),
            getUserMedia: () => {
                attempt += 1;
                return attempt === 1 ? Promise.reject(new Error('denied')) : Promise.resolve(stream);
            }
        });

        await expect(driver.start()).rejects.toThrow('denied');
        expect(driver.status).toBe('error');

        await driver.start();

        expect(driver.status).toBe('running');
        expect(driver.error).toBeNull();
        expect(tracks.every(track => !track.stopped)).toBe(true);
    });

    it('start() while starting joins the in-flight attempt instead of prompting twice', async () => {
        let calls = 0;
        const harness = createHarness({}, { type: 'mic' }, {
            deps: {
                getUserMedia: () => {
                    calls += 1;
                    return Promise.resolve(createFakeStream().stream);
                }
            }
        });

        const first = harness.driver.start();
        const second = harness.driver.start();
        expect(harness.driver.status).toBe('starting');

        await Promise.all([first, second]);

        expect(calls).toBe(1);
        expect(harness.context.analysers).toHaveLength(1);
        expect(harness.driver.status).toBe('running');
    });

    it('a subscriber that calls start() from inside the starting notification cannot open a second microphone', async () => {
        let calls = 0;
        const harness = createHarness({}, { type: 'mic' }, {
            deps: {
                getUserMedia: () => {
                    calls += 1;
                    return Promise.resolve(createFakeStream().stream);
                }
            }
        });

        const rejoined: Promise<void>[] = [];
        let reentered = false;
        harness.driver.subscribe(() => {
            if (!reentered && harness.driver.status === 'starting') {
                reentered = true;
                rejoined.push(harness.driver.start());
            }
        });

        await harness.driver.start();
        await Promise.all(rejoined);

        expect(reentered).toBe(true);
        expect(calls).toBe(1);
        expect(harness.context.streamSources).toHaveLength(1);
        expect(harness.context.analysers).toHaveLength(1);
        expect(harness.driver.status).toBe('running');
    });

    it('a denied start() the caller does not await reports through status and error without an unhandled rejection', async () => {
        const denied = new Error('NotAllowedError: Permission denied');
        const harness = createHarness({}, { type: 'mic' }, {
            deps: { getUserMedia: () => Promise.reject(denied) }
        });

        void harness.driver.start();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(harness.driver.status).toBe('error');
        expect(harness.driver.error).toBe(denied);
    });

    it('start() while running is a no-op that does not rebuild the graph', async () => {
        const harness = createHarness();
        await harness.driver.start();
        await harness.driver.start();

        expect(harness.context.analysers).toHaveLength(1);
        expect(harness.context.streamSources).toHaveLength(1);
        expect(harness.requests).toHaveLength(1);
    });

    it('start() -> stop() -> start() while the prompt is still open adopts the grant it already asked for', async () => {
        const context = new FakeContext();
        const { stream, tracks } = createFakeStream();
        let grants = 0;
        let contexts = 0;
        let grant: (value: MediaStream) => void = () => undefined;

        const driver = createAudioAnalyserDriver({ type: 'mic' }, validateAudioOptions(), {
            createContext: () => {
                contexts += 1;
                return asContext(context);
            },
            getUserMedia: () => {
                grants += 1;
                return new Promise<MediaStream>(resolve => { grant = resolve });
            }
        });

        const first = driver.start();
        expect(driver.status).toBe('starting');

        driver.stop();
        expect(driver.status).toBe('stopped');

        const second = driver.start();
        expect(driver.status).toBe('starting');
        expect(grants).toBe(1);

        grant(stream);
        await Promise.all([first, second]);

        expect(grants).toBe(1);
        expect(contexts).toBe(1);
        expect(driver.status).toBe('running');
        expect(context.analysers).toHaveLength(1);
        expect(context.streamSources).toHaveLength(1);
        expect(context.streamSources[0].connections).toEqual([latestAnalyser(context)]);
        expect(context.closeCalls).toBe(0);
        expect(tracks.every(track => !track.stopped)).toBe(true);
    });

    it('stop() then start() AFTER the graph is live tears the first one down and opens exactly one more', async () => {
        const contexts: FakeContext[] = [];
        const grants: FakeStream[] = [];

        const driver = createAudioAnalyserDriver({ type: 'mic' }, validateAudioOptions(), {
            createContext: () => {
                const context = new FakeContext();
                contexts.push(context);
                return asContext(context);
            },
            getUserMedia: () => {
                const grant = createFakeStream();
                grants.push(grant);
                return Promise.resolve(grant.stream);
            }
        });

        await driver.start();
        driver.stop();

        expect(grants).toHaveLength(1);
        expect(grants[0].tracks.every(track => track.stopped)).toBe(true);
        expect(contexts[0].closeCalls).toBe(1);

        await driver.start();

        expect(driver.status).toBe('running');
        expect(grants).toHaveLength(2);
        expect(contexts).toHaveLength(2);
        expect(grants[1].tracks.every(track => track.stopped)).toBe(false);
        expect(contexts[1].analysers).toHaveLength(1);
        expect(contexts[1].resumeCalls).toBe(1);
        expect(contexts[1].streamSources[0].connections).toEqual([latestAnalyser(contexts[1])]);
    });

    it('stop() during starting cancels the attempt and releases the microphone it was granted', async () => {
        const { stream, tracks } = createFakeStream();
        const context = new FakeContext();
        let grant: (value: MediaStream) => void = () => undefined;

        const driver = createAudioAnalyserDriver({ type: 'mic' }, validateAudioOptions(), {
            createContext: () => asContext(context),
            getUserMedia: () => new Promise<MediaStream>(resolve => { grant = resolve })
        });

        const starting = driver.start();
        expect(driver.status).toBe('starting');

        driver.stop();
        expect(driver.status).toBe('stopped');

        grant(stream);
        await expect(starting).resolves.toBeUndefined();

        expect(tracks.every(track => track.stopped)).toBe(true);
        expect(context.closeCalls).toBe(1);
        expect(context.analysers).toHaveLength(0);
        expect(driver.status).toBe('stopped');
    });

    it('a stop() during starting never resumes the caller-owned context it was about to use', async () => {
        const context = new FakeContext();
        const node = new FakeSourceNode(context);
        let release: () => void = () => undefined;

        const driver = createAudioAnalyserDriver(
            { type: 'node', node: node as unknown as AudioNode, context: asContext(context) },
            validateAudioOptions(),
            { getUserMedia: () => new Promise<MediaStream>(() => undefined) }
        );

        const gate = new Promise<void>(resolve => { release = resolve });
        const starting = driver.start();
        driver.stop();
        release();
        await gate;
        await expect(starting).resolves.toBeUndefined();

        expect(context.resumeCalls).toBe(0);
        expect(context.closeCalls).toBe(0);
        expect(context.analysers).toHaveLength(0);
        expect(node.connections).toEqual([]);
        expect(driver.status).toBe('stopped');
    });

    it('a stop() while the context is still resuming builds no graph and leaves no zombie microphone', async () => {
        const context = new FakeContext();
        context.deferResume = true;
        const harness = createHarness({}, { type: 'mic' }, { context });

        const starting = harness.driver.start();
        for (let turn = 0; turn < 20 && context.resumeCalls === 0; turn++) {
            await Promise.resolve();
        }
        expect(context.resumeCalls).toBe(1);
        expect(harness.driver.status).toBe('starting');

        harness.driver.stop();
        context.releaseResume?.();
        await expect(starting).resolves.toBeUndefined();

        expect(context.analysers).toHaveLength(0);
        expect(harness.context.streamSources[0].connections).toEqual([]);
        expect(harness.tracks.every(track => track.stopped)).toBe(true);
        expect(context.closeCalls).toBe(1);
        expect(harness.driver.status).toBe('stopped');
    });

    it('stop() is idempotent and inert from idle', async () => {
        const harness = createHarness();

        harness.driver.stop();
        expect(harness.driver.status).toBe('idle');
        expect(harness.requests).toHaveLength(0);

        await harness.driver.start();
        harness.driver.stop();
        harness.driver.stop();

        expect(harness.context.closeCalls).toBe(1);
        expect(harness.driver.status).toBe('stopped');
    });

    it('notifies subscribers on every status change', async () => {
        const harness = createHarness();
        const seen: string[] = [];
        const dispose = harness.driver.subscribe(() => { seen.push(harness.driver.status) });

        await harness.driver.start();
        harness.driver.stop();
        dispose();
        await harness.driver.start();

        expect(seen).toEqual(['starting', 'running', 'stopped']);
    });
});

describe('audio driver element sources', () => {
    it('keeps the media element audible by connecting the source to the destination', async () => {
        const element = asElement('audible');
        const harness = createHarness({}, { type: 'element', element });

        await harness.driver.start();

        const sourceNode = harness.context.elementSources[0];
        expect(sourceNode.connections).toContain(harness.context.destination);
        expect(sourceNode.connections).toContain(harness.analyser());

        harness.driver.stop();

        expect(sourceNode.connections).toEqual([harness.context.destination]);
        expect(harness.context.closeCalls).toBe(0);
    });

    it('binds createMediaElementSource once per element and reuses it across restarts and drivers', async () => {
        const element = asElement('reused');
        const context = new FakeContext();

        const first = createHarness({}, { type: 'element', element }, { context });
        await first.driver.start();
        first.driver.stop();
        await first.driver.start();

        expect(context.elementSources).toHaveLength(1);

        const otherContext = new FakeContext();
        const second = createHarness({}, { type: 'element', element }, { context: otherContext });
        await second.driver.start();

        expect(context.elementSources).toHaveLength(1);
        expect(otherContext.elementSources).toHaveLength(0);
        expect(otherContext.analysers).toHaveLength(0);
        expect(context.analysers.length).toBeGreaterThan(1);
        expect(second.driver.status).toBe('running');
    });

    it('translates the platform InvalidStateError for an element bound outside micugl', async () => {
        const element = asElement('foreign');
        const context = new FakeContext();
        context.bindThrows = true;

        const harness = createHarness({}, { type: 'element', element }, { context });

        await expect(harness.driver.start())
            .rejects.toThrow(/already bound to an AudioContext that micugl did not create/);
        await expect(harness.driver.start()).rejects.toThrow(/only ever be connected to one AudioContext/);
        expect(harness.driver.status).toBe('error');
        expect(context.closeCalls).toBeGreaterThan(0);
    });

    it('a failure to build the analyser leaves the element bound, audible, and its context open', async () => {
        const element = asElement('survives-a-failed-start');
        const context = new FakeContext();
        context.sampleRate = 384000;

        const harness = createHarness({ bands: 4, fftSize: 32 }, { type: 'element', element }, { context });

        await expect(harness.driver.start()).rejects.toThrow(/cannot be\s+split into 4 non-empty/);

        expect(harness.driver.status).toBe('error');
        expect(context.closeCalls).toBe(0);
        expect(context.elementSources[0].connections).toEqual([context.destination]);
    });
});

describe('audio driver reconfigure', () => {
    it('rebuilds the analyser against the surviving source node, and keeps analysing', async () => {
        const element = asElement('reconfigure');
        const harness = createHarness({ bands: 4, fftSize: 2048 }, { type: 'element', element });
        await harness.driver.start();

        const sourceNode = harness.context.elementSources[0];
        const original = harness.analyser();

        harness.driver.reconfigure(validateAudioOptions({
            bands: 2,
            fftSize: 64,
            bandLayout: 'linear',
            attack: 0.05,
            release: 0.4
        }));

        const rebuilt = harness.analyser();
        expect(harness.context.analysers).toHaveLength(2);
        expect(rebuilt).not.toBe(original);
        expect(harness.context.elementSources).toHaveLength(1);
        expect(sourceNode.connections).toContain(rebuilt);
        expect(sourceNode.connections).not.toContain(original);
        expect(sourceNode.connections).toContain(harness.context.destination);

        expect(harness.driver.bandsScratch).toHaveLength(2);
        expect(rebuilt.fftSize).toBe(64);

        rebuilt.spectrum = LOW_HALF;
        harness.driver.analyseIfNeeded(0);
        harness.driver.analyseIfNeeded(200);

        expect(harness.driver.bandsScratch[0]).toBeGreaterThan(0);
        expect(original.reads).toBe(0);
        expect(rebuilt.reads).toBe(2);
    });

    it('applies the decibel window in an order the platform accepts, even when it inverts the defaults', async () => {
        const harness = createHarness({ minDecibels: -20, maxDecibels: -5 });

        await harness.driver.start();

        const analyser = harness.analyser();
        expect(analyser.minDecibels).toBe(-20);
        expect(analyser.maxDecibels).toBe(-5);
        expect(harness.driver.status).toBe('running');
    });

    it('a reconfigure that cannot build an analyser throws, and the running driver keeps analysing every frame after', async () => {
        const harness = createHarness(TWO_BAND_LINEAR);
        await harness.driver.start();
        const original = harness.analyser();
        original.spectrum = LOW_HALF;

        harness.driver.analyseIfNeeded(0);
        harness.driver.analyseIfNeeded(16);
        const beforeReconfigure = harness.driver.bandsScratch[0];
        expect(beforeReconfigure).toBeGreaterThan(0);

        harness.context.sampleRate = 384000;
        const impossible = validateAudioOptions({ bands: 4, fftSize: 32 });

        expect(() => { harness.driver.reconfigure(impossible) }).toThrow(/cannot be\s+split into 4 non-empty/);

        expect(harness.driver.status).toBe('running');
        expect(harness.driver.bandsScratch).toHaveLength(2);
        expect(harness.context.streamSources[0].connections).toEqual([original]);

        harness.driver.analyseIfNeeded(32);
        harness.driver.analyseIfNeeded(48);

        expect(original.reads).toBe(4);
        expect(harness.driver.bandsScratch).toHaveLength(2);
        expect(harness.driver.bandsScratch[0]).toBeGreaterThan(beforeReconfigure);
        expect(harness.driver.level).toBeGreaterThan(0);
    });

    it('a reconfigure while idle still resizes the bands the next start() will fill', () => {
        const harness = createHarness({ bands: 4, fftSize: 2048 });

        harness.driver.reconfigure(validateAudioOptions(TWO_BAND_LINEAR));

        expect(harness.driver.bandsScratch).toHaveLength(2);
        expect(harness.driver.status).toBe('idle');
        expect(harness.context.analysers).toHaveLength(0);
    });
});

describe('audio driver invalidation kind', () => {
    function kindHarness(): { driver: ReturnType<typeof createAudioAnalyserDriver>; kinds: InvalidationKind[]; context: FakeContext } {
        const context = new FakeContext();
        const { stream } = createFakeStream();
        const driver = createAudioAnalyserDriver({ type: 'mic' }, validateAudioOptions(TWO_BAND_LINEAR), {
            createContext: () => asContext(context),
            getUserMedia: () => Promise.resolve(stream)
        });
        const kinds: InvalidationKind[] = [];
        driver.invalidation.connect(kind => { kinds.push(kind) });
        return { driver, kinds, context };
    }

    it('analyseIfNeeded emits continuous while start, stop and reconfigure emit discrete', async () => {
        const harness = kindHarness();

        await harness.driver.start();
        expect(harness.kinds).toEqual(['discrete']);

        latestAnalyser(harness.context).spectrum = LOW_HALF;
        harness.driver.analyseIfNeeded(16);
        harness.driver.analyseIfNeeded(32);
        expect(harness.kinds).toEqual(['discrete', 'continuous', 'continuous']);

        harness.driver.reconfigure(validateAudioOptions({ ...TWO_BAND_LINEAR, fftSize: 128 }));
        expect(harness.kinds[harness.kinds.length - 1]).toBe('discrete');

        harness.driver.stop();
        expect(harness.kinds[harness.kinds.length - 1]).toBe('discrete');
    });

    it('a start failure emits discrete so the poster shows the error state', async () => {
        const context = new FakeContext();
        const driver = createAudioAnalyserDriver({ type: 'mic' }, validateAudioOptions(TWO_BAND_LINEAR), {
            createContext: () => asContext(context),
            getUserMedia: () => Promise.reject(new Error('denied'))
        });
        const kinds: InvalidationKind[] = [];
        driver.invalidation.connect(kind => { kinds.push(kind) });

        await driver.start().catch(() => undefined);

        expect(kinds).toEqual(['discrete']);
    });
});
