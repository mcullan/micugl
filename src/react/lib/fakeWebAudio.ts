export type Spectrum = (bin: number, binCount: number) => number;

export const LOW_HALF: Spectrum = (bin, binCount) => (bin < binCount / 2 ? 255 : 0);
export const HIGH_HALF: Spectrum = (bin, binCount) => (bin < binCount / 2 ? 0 : 255);

export class FakeAnalyser {
    fftSize = 2048;
    smoothingTimeConstant = 0.8;
    reads = 0;
    spectrum: Spectrum = () => 0;
    private minValue = -100;
    private maxValue = -30;

    get minDecibels(): number { return this.minValue }
    set minDecibels(value: number) {
        if (value >= this.maxValue) {
            throw new Error(`IndexSizeError: minDecibels ${value} is not below maxDecibels ${this.maxValue}`);
        }
        this.minValue = value;
    }

    get maxDecibels(): number { return this.maxValue }
    set maxDecibels(value: number) {
        if (value <= this.minValue) {
            throw new Error(`IndexSizeError: maxDecibels ${value} is not above minDecibels ${this.minValue}`);
        }
        this.maxValue = value;
    }

    get frequencyBinCount(): number { return this.fftSize / 2 }

    getByteFrequencyData(target: Uint8Array): void {
        this.reads += 1;
        for (let i = 0; i < target.length; i++) {
            target[i] = this.spectrum(i, target.length);
        }
    }
}

export class FakeSourceNode {
    connections: unknown[] = [];
    constructor(public context: FakeContext) {}
    connect(target: unknown): void { this.connections.push(target) }
    disconnect(target: unknown): void { this.connections = this.connections.filter(entry => entry !== target) }
}

export class FakeContext {
    state: AudioContextState = 'suspended';
    sampleRate = 48000;
    destination = { id: 'destination' };
    analysers: FakeAnalyser[] = [];
    streamSources: FakeSourceNode[] = [];
    elementSources: FakeSourceNode[] = [];
    resumeCalls = 0;
    closeCalls = 0;
    bindThrows = false;
    deferResume = false;
    releaseResume: (() => void) | null = null;

    createAnalyser(): FakeAnalyser {
        const analyser = new FakeAnalyser();
        this.analysers.push(analyser);
        return analyser;
    }

    createMediaStreamSource(_stream: MediaStream): FakeSourceNode {
        const node = new FakeSourceNode(this);
        this.streamSources.push(node);
        return node;
    }

    createMediaElementSource(_element: HTMLMediaElement): FakeSourceNode {
        if (this.bindThrows) {
            throw new Error('InvalidStateError: HTMLMediaElement already connected to a different MediaElementSourceNode');
        }
        const node = new FakeSourceNode(this);
        this.elementSources.push(node);
        return node;
    }

    resume(): Promise<void> {
        this.resumeCalls += 1;
        if (this.deferResume) {
            return new Promise<void>(resolve => {
                this.releaseResume = () => {
                    this.state = 'running';
                    resolve();
                };
            });
        }
        this.state = 'running';
        return Promise.resolve();
    }

    close(): Promise<void> {
        this.closeCalls += 1;
        this.state = 'closed';
        return Promise.resolve();
    }
}

export interface FakeTrack {
    stopped: boolean;
    stop: () => void;
}

export interface FakeStream {
    stream: MediaStream;
    tracks: FakeTrack[];
}

export function createFakeStream(): FakeStream {
    const tracks: FakeTrack[] = [
        { stopped: false, stop() { this.stopped = true } },
        { stopped: false, stop() { this.stopped = true } }
    ];
    return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
}

export function asContext(context: FakeContext): AudioContext {
    return context as unknown as AudioContext;
}

export function asElement(id: string): HTMLMediaElement {
    return { id } as unknown as HTMLMediaElement;
}

export function latestAnalyser(context: FakeContext): FakeAnalyser {
    const analyser = context.analysers[context.analysers.length - 1] as FakeAnalyser | undefined;
    if (!analyser) {
        throw new Error('fakeWebAudio: no analyser has been created on this context yet');
    }
    return analyser;
}
