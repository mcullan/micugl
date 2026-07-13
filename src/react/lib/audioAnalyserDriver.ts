import type { BandRange, ResolvedAnalyserOptions } from '@/core/lib/audioBands';
import { applyEnvelope, computeBandRanges, reduceBands } from '@/core/lib/audioBands';
import type { FrameInvalidation } from '@/core/lib/frameInvalidation';
import { createFrameInvalidation } from '@/core/lib/frameInvalidation';
import type { AudioSourceSpec, AudioStatus } from '@/types';

export interface AudioAnalyserDriverDeps {
    createContext?: () => AudioContext;
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export interface AudioAnalyserDriver {
    start(): Promise<void>;
    stop(): void;
    analyseIfNeeded(timeMs: number): void;
    reconfigure(options: ResolvedAnalyserOptions): void;
    subscribe: (onChange: () => void) => () => void;
    readonly bandsScratch: Float32Array;
    readonly level: number;
    readonly status: AudioStatus;
    readonly error: Error | null;
    readonly invalidation: FrameInvalidation;
}

interface Analysis {
    analyser: AnalyserNode;
    freqData: Uint8Array;
    ranges: BandRange[];
}

interface SourceGraph {
    context: AudioContext;
    mayCloseContext: boolean;
    sourceNode: AudioNode;
    stream: MediaStream | null;
}

interface AudioGraph extends SourceGraph {
    analysis: Analysis;
}

type DriverState =
    | { kind: 'idle' }
    | { kind: 'starting'; pending: Promise<void> }
    | { kind: 'running'; graph: AudioGraph }
    | { kind: 'stopped' }
    | { kind: 'error'; error: Error };

type DesiredState = 'running' | 'stopped';

interface ElementBinding {
    context: AudioContext;
    sourceNode: MediaElementAudioSourceNode;
}

const ELEMENT_BINDINGS = new WeakMap<HTMLMediaElement, ElementBinding>();

const MAX_DT_SECONDS = 0.1;

function defaultCreateContext(): AudioContext {
    if (typeof AudioContext !== 'function') {
        throw new Error(
            'micugl audio: this environment has no AudioContext, so micugl cannot analyse audio. WebAudio is '
            + 'browser-only; start() must run in a browser, never during server rendering.'
        );
    }
    return new AudioContext();
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (typeof navigator !== 'object' || typeof navigator.mediaDevices !== 'object') {
        throw new Error(
            'micugl audio: navigator.mediaDevices.getUserMedia is unavailable, so the microphone cannot be opened. '
            + 'getUserMedia only exists in a secure context: serve the page over https, or from localhost.'
        );
    }
    return navigator.mediaDevices.getUserMedia(constraints);
}

function toError(cause: unknown): Error {
    return cause instanceof Error ? cause : new Error(String(cause));
}

function keepRejectionHandled(promise: Promise<void>): void {
    void promise.catch(() => undefined);
}

function stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
        track.stop();
    }
}

function assertUsableContext(context: AudioContext, what: string): void {
    if (context.state === 'closed') {
        throw new Error(
            `micugl audio: the AudioContext ${what} is closed, so no analyser can be built on it. A closed `
            + 'AudioContext cannot be reopened.'
        );
    }
}

function buildAnalysis(context: AudioContext, options: ResolvedAnalyserOptions): Analysis {
    const analyser = context.createAnalyser();
    analyser.fftSize = options.fftSize;
    analyser.smoothingTimeConstant = options.smoothingTimeConstant;

    if (options.minDecibels >= analyser.maxDecibels) {
        analyser.maxDecibels = options.maxDecibels;
        analyser.minDecibels = options.minDecibels;
    } else {
        analyser.minDecibels = options.minDecibels;
        analyser.maxDecibels = options.maxDecibels;
    }

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const ranges = computeBandRanges(
        analyser.frequencyBinCount,
        context.sampleRate,
        options.bands,
        options.bandLayout
    );

    return { analyser, freqData, ranges };
}

function bindElement(element: HTMLMediaElement, createContext: () => AudioContext): SourceGraph {
    const bound = ELEMENT_BINDINGS.get(element);
    if (bound) {
        return { context: bound.context, mayCloseContext: false, sourceNode: bound.sourceNode, stream: null };
    }

    const context = createContext();
    let sourceNode: MediaElementAudioSourceNode;
    try {
        sourceNode = context.createMediaElementSource(element);
    } catch (cause) {
        void context.close();
        throw new Error(
            'micugl audio: this media element is already bound to an AudioContext that micugl did not create, and a '
            + 'media element can only ever be connected to one AudioContext for the lifetime of the page. Either let '
            + 'micugl own the element, or pass the source node you already made as { type: "node", node, context }. '
            + `(the browser said: ${toError(cause).message})`
        );
    }

    sourceNode.connect(context.destination);
    ELEMENT_BINDINGS.set(element, { context, sourceNode });

    return { context, mayCloseContext: false, sourceNode, stream: null };
}

export function createAudioAnalyserDriver(
    source: AudioSourceSpec,
    options: ResolvedAnalyserOptions,
    deps: AudioAnalyserDriverDeps = {}
): AudioAnalyserDriver {
    const invalidation = createFrameInvalidation();
    const listeners = new Set<() => void>();
    const createContext = deps.createContext ?? defaultCreateContext;
    const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;

    let currentOptions = options;
    let state: DriverState = { kind: 'idle' };
    let desired: DesiredState = 'stopped';
    let bands = new Float32Array(currentOptions.bands);
    let raw = new Float32Array(currentOptions.bands);
    let level = 0;
    let lastAnalysedTime: number | null = null;

    function notify(): void {
        listeners.forEach(listener => { listener() });
    }

    function setState(next: DriverState): void {
        state = next;
        notify();
    }

    function readStatus(): AudioStatus {
        if (state.kind === 'starting' && desired === 'stopped') {
            return 'stopped';
        }
        return state.kind;
    }

    function resetBands(): void {
        bands.fill(0);
        raw.fill(0);
        level = 0;
        lastAnalysedTime = null;
    }

    function releaseSource(graph: SourceGraph): void {
        if (graph.stream) {
            stopTracks(graph.stream);
        }
        if (graph.mayCloseContext) {
            void graph.context.close();
        }
    }

    function releaseGraph(graph: AudioGraph): void {
        graph.sourceNode.disconnect(graph.analysis.analyser);
        releaseSource(graph);
    }

    async function acquireSource(): Promise<SourceGraph> {
        if (source.type === 'mic') {
            const stream = await getUserMedia({ audio: true });
            try {
                const context = createContext();
                return {
                    context,
                    mayCloseContext: true,
                    sourceNode: context.createMediaStreamSource(stream),
                    stream
                };
            } catch (cause) {
                stopTracks(stream);
                throw cause;
            }
        }

        if (source.type === 'element') {
            return bindElement(source.element, createContext);
        }

        if (source.node.context !== source.context) {
            throw new Error(
                'micugl audio: the "node" source was given a node and a context that do not match (node.context is a '
                + 'different AudioContext). WebAudio cannot connect nodes across contexts. Pass the context the node '
                + 'was actually created on.'
            );
        }
        assertUsableContext(source.context, 'passed with the "node" source');

        return { context: source.context, mayCloseContext: false, sourceNode: source.node, stream: null };
    }

    async function beginStart(): Promise<void> {
        let acquired: SourceGraph | null = null;
        let started: AudioGraph | null = null;
        let failure: Error | null = null;

        try {
            acquired = await acquireSource();

            if (desired === 'running' && acquired.context.state === 'suspended') {
                await acquired.context.resume();
            }

            if (desired === 'running') {
                const analysis = buildAnalysis(acquired.context, currentOptions);
                acquired.sourceNode.connect(analysis.analyser);
                started = { ...acquired, analysis };
            }
        } catch (cause) {
            failure = toError(cause);
        }

        if (started === null && acquired !== null) {
            releaseSource(acquired);
        }

        if (failure !== null) {
            resetBands();
            if (desired === 'running') {
                desired = 'stopped';
                setState({ kind: 'error', error: failure });
            } else {
                setState({ kind: 'stopped' });
            }
            invalidation.request();
            throw failure;
        }

        if (started === null) {
            setState({ kind: 'stopped' });
            return;
        }

        resetBands();
        setState({ kind: 'running', graph: started });
        invalidation.request();
    }

    function start(): Promise<void> {
        const wasStopping = desired === 'stopped';
        desired = 'running';

        if (state.kind === 'running') {
            return Promise.resolve();
        }
        if (state.kind === 'starting') {
            if (wasStopping) {
                notify();
            }
            return state.pending;
        }

        const run = beginStart();
        keepRejectionHandled(run);
        setState({ kind: 'starting', pending: run });

        return run;
    }

    function stop(): void {
        const wasStarting = desired === 'running';
        desired = 'stopped';

        if (state.kind === 'starting') {
            if (!wasStarting) {
                return;
            }
            resetBands();
            notify();
            invalidation.request();
            return;
        }

        if (state.kind !== 'running') {
            return;
        }

        releaseGraph(state.graph);
        resetBands();
        setState({ kind: 'stopped' });
        invalidation.request();
    }

    function analyseIfNeeded(timeMs: number): void {
        if (state.kind !== 'running') {
            return;
        }
        if (!Number.isFinite(timeMs)) {
            return;
        }
        if (lastAnalysedTime !== null && !(timeMs > lastAnalysedTime)) {
            return;
        }

        const { analyser, freqData, ranges } = state.graph.analysis;
        analyser.getByteFrequencyData(freqData);
        reduceBands(freqData, ranges, raw);

        const dtSeconds = lastAnalysedTime === null
            ? 0
            : Math.min(MAX_DT_SECONDS, (timeMs - lastAnalysedTime) / 1000);

        let sum = 0;
        for (let i = 0; i < bands.length; i++) {
            bands[i] = applyEnvelope(
                bands[i],
                raw[i],
                dtSeconds,
                currentOptions.attack,
                currentOptions.release
            );
            sum += bands[i];
        }
        level = sum / bands.length;

        lastAnalysedTime = timeMs;
        invalidation.request('continuous');
    }

    function adoptOptions(next: ResolvedAnalyserOptions): void {
        if (next.bands !== currentOptions.bands) {
            bands = new Float32Array(next.bands);
            raw = new Float32Array(next.bands);
            level = 0;
            lastAnalysedTime = null;
        }
        currentOptions = next;
    }

    function reconfigure(next: ResolvedAnalyserOptions): void {
        if (state.kind !== 'running') {
            adoptOptions(next);
            return;
        }

        const graph = state.graph;
        const analysis = buildAnalysis(graph.context, next);

        adoptOptions(next);

        graph.sourceNode.disconnect(graph.analysis.analyser);
        graph.sourceNode.connect(analysis.analyser);
        graph.analysis = analysis;

        invalidation.request();
    }

    return {
        start,
        stop,
        analyseIfNeeded,
        reconfigure,
        subscribe: onChange => {
            listeners.add(onChange);
            return () => { listeners.delete(onChange) };
        },
        get bandsScratch() { return bands },
        get level() { return level },
        get status() { return readStatus() },
        get error() { return state.kind === 'error' ? state.error : null },
        invalidation
    };
}
