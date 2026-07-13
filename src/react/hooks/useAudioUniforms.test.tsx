import { act, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AudioUniformsResult } from '@/react/hooks/useAudioUniforms';
import { useAudioUniforms } from '@/react/hooks/useAudioUniforms';
import type { AudioAnalyserDriverDeps } from '@/react/lib/audioAnalyserDriver';
import type { FakeTrack } from '@/react/lib/fakeWebAudio';
import { asContext, asElement, createFakeStream, FakeContext, latestAnalyser, LOW_HALF } from '@/react/lib/fakeWebAudio';
import type { AudioSourceSpec, AudioUniformsOptions } from '@/types';

const MIC: AudioSourceSpec = { type: 'mic' };

interface Fixture {
    context: FakeContext;
    tracks: FakeTrack[];
    deps: AudioAnalyserDriverDeps;
    grants: number;
    contexts: number;
}

function createFixture(overrides: Partial<AudioAnalyserDriverDeps> = {}): Fixture {
    const context = new FakeContext();
    const fixture: Fixture = {
        context,
        tracks: [],
        grants: 0,
        contexts: 0,
        deps: {
            createContext: () => {
                fixture.contexts += 1;
                return asContext(context);
            },
            getUserMedia: () => {
                fixture.grants += 1;
                const granted = createFakeStream();
                fixture.tracks.push(...granted.tracks);
                return Promise.resolve(granted.stream);
            },
            ...overrides
        }
    };
    return fixture;
}

interface ProbeProps {
    probe: { current: AudioUniformsResult | null };
    source?: AudioSourceSpec;
    options?: AudioUniformsOptions;
    deps: AudioAnalyserDriverDeps;
}

const Probe = ({ probe, source = MIC, options, deps }: ProbeProps) => {
    probe.current = useAudioUniforms(source, options, deps);
    return null;
};

const AutoStarting = ({ probe, source = MIC, options, deps }: ProbeProps) => {
    const audio = useAudioUniforms(source, options, deps);
    probe.current = audio;

    const { start, stop } = audio;
    useEffect(() => {
        void start();
        return stop;
    }, [start, stop]);

    return null;
};

function sample(result: AudioUniformsResult, name: string, time: number): number[] {
    const param = result.uniforms[name];
    if (typeof param.value !== 'function') {
        throw new Error(`expected "${name}" to be a function-valued uniform`);
    }
    const value = param.value(time);
    return typeof value === 'number' ? [value] : Array.from(value);
}

const TWO_BAND_LINEAR: AudioUniformsOptions = {
    bands: 2,
    fftSize: 64,
    bandLayout: 'linear',
    attack: 0.05,
    release: 0.4
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => { root.unmount() });
    container.remove();
});

function render(element: React.ReactElement): void {
    act(() => { root.render(element) });
}

function probeRef(): { current: AudioUniformsResult | null } {
    return { current: null };
}

function current(probe: { current: AudioUniformsResult | null }): AudioUniformsResult {
    const value = probe.current;
    if (!value) {
        throw new Error('the hook has not rendered yet');
    }
    return value;
}

describe('useAudioUniforms uniforms', () => {
    it('packs the bands into one uniform whose type follows the band count, alongside the level float', () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} />);
        expect(current(probe).uniforms.u_audioBands.type).toBe('vec4');
        expect(current(probe).uniforms.u_audioLevel.type).toBe('float');

        render(<Probe probe={probe} deps={fixture.deps} options={{ bands: 1 }} />);
        expect(current(probe).uniforms.u_audioBands.type).toBe('float');
        expect(sample(current(probe), 'u_audioBands', 16)).toEqual([0]);

        render(<Probe probe={probe} deps={fixture.deps} options={{ bands: 3, names: { bands: 'u_fft', level: 'u_loud' } }} />);
        expect(Object.keys(current(probe).uniforms)).toEqual(['u_fft', 'u_loud']);
        expect(current(probe).uniforms.u_fft.type).toBe('vec3');
    });

    it('hands the engine the driver invalidation on every audio uniform, so a demand engine can be woken', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} options={TWO_BAND_LINEAR} />);

        const bands = current(probe).uniforms.u_audioBands.invalidation;
        const level = current(probe).uniforms.u_audioLevel.invalidation;
        expect(bands).toBeDefined();
        expect(level).toBe(bands);

        const woken: number[] = [];
        bands?.connect(() => { woken.push(1) });

        expect(woken).toHaveLength(0);
        await act(async () => { await current(probe).start() });
        expect(woken).toHaveLength(1);

        sample(current(probe), 'u_audioBands', 16);
        expect(woken).toHaveLength(2);

        sample(current(probe), 'u_audioLevel', 16);
        expect(woken).toHaveLength(2);
    });

    it('samples the analyser at frame time: the bands advance across frames and the level is their mean', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} options={TWO_BAND_LINEAR} />);
        await act(async () => { await current(probe).start() });
        latestAnalyser(fixture.context).spectrum = LOW_HALF;

        const series: number[][] = [];
        for (let time = 0; time <= 160; time += 16) {
            series.push(sample(current(probe), 'u_audioBands', time));
        }

        expect(series[0]).toEqual([0, 0]);
        for (let i = 2; i < series.length; i++) {
            expect(series[i][0]).toBeGreaterThan(series[i - 1][0]);
        }
        expect(series[series.length - 1][0]).toBeGreaterThan(0.8);
        expect(series.every(bands => bands.every(value => Number.isFinite(value)))).toBe(true);

        const bands = sample(current(probe), 'u_audioBands', 176);
        const level = sample(current(probe), 'u_audioLevel', 176);
        expect(level).toEqual([(bands[0] + bands[1]) / 2]);
    });

    it('reads the reallocated scratch after a bands change instead of a buffer captured when the uniforms were built', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} options={{ ...TWO_BAND_LINEAR, bands: 4 }} />);
        await act(async () => { await current(probe).start() });
        latestAnalyser(fixture.context).spectrum = LOW_HALF;

        for (let time = 0; time <= 320; time += 16) {
            sample(current(probe), 'u_audioBands', time);
        }
        expect(sample(current(probe), 'u_audioBands', 336)).toHaveLength(4);

        render(<Probe probe={probe} deps={fixture.deps} options={TWO_BAND_LINEAR} />);
        latestAnalyser(fixture.context).spectrum = LOW_HALF;

        expect(current(probe).uniforms.u_audioBands.type).toBe('vec2');

        const series: number[][] = [];
        for (let time = 352; time <= 512; time += 16) {
            series.push(sample(current(probe), 'u_audioBands', time));
        }

        expect(series.every(bands => bands.length === 2)).toBe(true);
        expect(series.every(bands => bands.every(value => Number.isFinite(value)))).toBe(true);
        expect(series[0][0]).toBeLessThan(0.2);
        for (let i = 2; i < series.length; i++) {
            expect(series[i][0]).toBeGreaterThan(series[i - 1][0]);
        }
        expect(series[series.length - 1][0]).toBeGreaterThan(0.8);
    });
});

describe('useAudioUniforms lifecycle', () => {
    it('surfaces the driver status and error through React state', async () => {
        const denied = new Error('NotAllowedError: Permission denied');
        const probe = probeRef();
        const fixture = createFixture({ getUserMedia: () => Promise.reject(denied) });

        render(<Probe probe={probe} deps={fixture.deps} />);
        expect(current(probe).status).toBe('idle');
        expect(current(probe).error).toBeNull();

        await act(async () => { await expect(current(probe).start()).rejects.toThrow('Permission denied') });

        expect(current(probe).status).toBe('error');
        expect(current(probe).error).toBe(denied);
    });

    it('re-renders as the status moves from idle to running to stopped', async () => {
        const probe = probeRef();
        const fixture = createFixture();
        const seen: string[] = [];

        const Watcher = () => {
            const audio = useAudioUniforms(MIC, undefined, fixture.deps);
            probe.current = audio;
            seen.push(audio.status);
            return null;
        };

        render(<Watcher />);
        await act(async () => { await current(probe).start() });
        act(() => { current(probe).stop() });

        expect(seen).toContain('idle');
        expect(seen).toContain('running');
        expect(seen[seen.length - 1]).toBe('stopped');
    });

    it("StrictMode's double-invoked start/stop/start effect opens one AudioContext and rebinds the element once", async () => {
        const probe = probeRef();
        const fixture = createFixture();
        const element = asElement('strict');

        await act(async () => {
            root.render(
                <StrictMode>
                    <AutoStarting probe={probe} deps={fixture.deps} source={{ type: 'element', element }} />
                </StrictMode>
            );
            await Promise.resolve();
        });

        expect(fixture.contexts).toBe(1);
        expect(fixture.grants).toBe(0);
        expect(fixture.context.elementSources).toHaveLength(1);
        expect(fixture.context.analysers).toHaveLength(1);
        expect(current(probe).status).toBe('running');

        const sourceNode = fixture.context.elementSources[0];
        expect(sourceNode.connections).toEqual([
            fixture.context.destination,
            latestAnalyser(fixture.context)
        ]);

        act(() => { root.unmount() });

        expect(sourceNode.connections).toEqual([fixture.context.destination]);
        expect(fixture.context.closeCalls).toBe(0);
    });

    it("StrictMode's double-invoked start/stop/start effect prompts for the microphone exactly once", async () => {
        const probe = probeRef();
        const fixture = createFixture();

        await act(async () => {
            root.render(
                <StrictMode>
                    <AutoStarting probe={probe} deps={fixture.deps} />
                </StrictMode>
            );
            await Promise.resolve();
        });

        expect(fixture.grants).toBe(1);
        expect(fixture.contexts).toBe(1);
        expect(fixture.tracks).toHaveLength(2);
        expect(fixture.context.streamSources).toHaveLength(1);
        expect(fixture.context.analysers).toHaveLength(1);
        expect(current(probe).status).toBe('running');
        expect(fixture.tracks.every(track => track.stopped)).toBe(false);

        const sourceNode = fixture.context.streamSources[0];
        expect(sourceNode.connections).toEqual([latestAnalyser(fixture.context)]);
        expect(sourceNode.connections).not.toContain(fixture.context.destination);

        act(() => { root.unmount() });

        expect(fixture.tracks.every(track => track.stopped)).toBe(true);
        expect(fixture.context.closeCalls).toBe(1);
        expect(fixture.grants).toBe(1);
    });

    it('releases the microphone and closes the AudioContext on unmount', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} />);
        await act(async () => { await current(probe).start() });

        expect(fixture.grants).toBe(1);
        expect(fixture.contexts).toBe(1);
        expect(fixture.context.analysers).toHaveLength(1);
        expect(current(probe).status).toBe('running');
        expect(fixture.tracks.every(track => track.stopped)).toBe(false);

        act(() => { root.unmount() });

        expect(fixture.tracks.every(track => track.stopped)).toBe(true);
        expect(fixture.context.closeCalls).toBe(1);
        expect(fixture.grants).toBe(1);
    });

    it('throws when the source is swapped under a live hook instead of silently rebinding it', () => {
        const probe = probeRef();
        const fixture = createFixture();
        const first = asElement('first');
        const second = asElement('second');

        render(<Probe probe={probe} deps={fixture.deps} source={{ type: 'element', element: first }} />);

        expect(() => {
            render(<Probe probe={probe} deps={fixture.deps} source={{ type: 'element', element: second }} />);
        }).toThrow(/one audio graph for its whole life/);
    });
});

describe('useAudioUniforms reconfiguration', () => {
    it('renaming the uniforms does not rebuild the analyser, so the smoothing history survives', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} options={TWO_BAND_LINEAR} />);
        await act(async () => { await current(probe).start() });
        latestAnalyser(fixture.context).spectrum = LOW_HALF;

        for (let time = 0; time <= 96; time += 16) {
            sample(current(probe), 'u_audioBands', time);
        }
        const before = sample(current(probe), 'u_audioBands', 112)[0];
        expect(before).toBeGreaterThan(0);

        render(
            <Probe
                probe={probe}
                deps={fixture.deps}
                options={{ ...TWO_BAND_LINEAR, names: { bands: 'u_spectrum', level: 'u_loudness' } }}
            />
        );

        expect(fixture.context.analysers).toHaveLength(1);
        expect(Object.keys(current(probe).uniforms)).toEqual(['u_spectrum', 'u_loudness']);

        const after = sample(current(probe), 'u_spectrum', 128)[0];
        expect(after).toBeGreaterThan(before);
    });

    it('a reconfigure the device rejects throws, and tears the hook down without leaving the microphone open', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} options={TWO_BAND_LINEAR} />);
        await act(async () => { await current(probe).start() });
        expect(current(probe).status).toBe('running');
        expect(fixture.tracks.every(track => track.stopped)).toBe(false);

        fixture.context.sampleRate = 384000;

        expect(() => {
            render(<Probe probe={probe} deps={fixture.deps} options={{ bands: 4, fftSize: 32 }} />);
        }).toThrow(/cannot be\s+split into 4 non-empty/);

        expect(fixture.tracks.every(track => track.stopped)).toBe(true);
        expect(fixture.context.closeCalls).toBe(1);
        expect(fixture.grants).toBe(1);
    });

    it('changing an analyser option rebuilds the analyser against the same source', async () => {
        const probe = probeRef();
        const fixture = createFixture();

        render(<Probe probe={probe} deps={fixture.deps} options={TWO_BAND_LINEAR} />);
        await act(async () => { await current(probe).start() });

        const original = latestAnalyser(fixture.context);
        expect(original.fftSize).toBe(64);

        render(<Probe probe={probe} deps={fixture.deps} options={{ ...TWO_BAND_LINEAR, fftSize: 128 }} />);

        expect(fixture.context.analysers).toHaveLength(2);
        expect(latestAnalyser(fixture.context).fftSize).toBe(128);
        expect(fixture.context.streamSources).toHaveLength(1);
        expect(fixture.context.streamSources[0].connections).toEqual([latestAnalyser(fixture.context)]);
        expect(current(probe).status).toBe('running');
    });
});
