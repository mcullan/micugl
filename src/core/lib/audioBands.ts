import type { AudioUniformsOptions, BandLayout } from '@/types';

export interface BandRange {
    start: number;
    end: number;
}

export interface ResolvedAudioNames {
    bands: string;
    level: string;
}

export interface ResolvedAnalyserOptions {
    bands: number;
    fftSize: number;
    smoothingTimeConstant: number;
    attack: number;
    release: number;
    minDecibels: number;
    maxDecibels: number;
    bandLayout: BandLayout;
}

export interface ResolvedAudioOptions extends ResolvedAnalyserOptions {
    names: ResolvedAudioNames;
}

const MAX_BANDS = 4;
const AUDIBLE_LOW_HZ = 20;
const AUDIBLE_HIGH_HZ = 20000;

const MIN_FFT_SIZE = 32;
const MAX_FFT_SIZE = 32768;

const DEFAULT_BANDS = 4;
const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_SMOOTHING = 0.8;
const DEFAULT_MIN_DECIBELS = -90;
const DEFAULT_MAX_DECIBELS = -10;
const DEFAULT_BANDS_NAME = 'u_audioBands';
const DEFAULT_LEVEL_NAME = 'u_audioLevel';

const BAND_LAYOUTS: Record<BandLayout, true> = { log: true, linear: true };

function isPowerOfTwo(value: number): boolean {
    return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function partitionBins(rawEdges: number[], lo: number, hi: number, bands: number): BandRange[] {
    const bins: number[] = new Array<number>(bands + 1);
    bins[0] = lo;
    for (let k = 1; k < bands; k++) {
        bins[k] = Math.min(hi, Math.max(lo, Math.round(rawEdges[k])));
    }
    bins[bands] = hi;

    for (let k = 1; k <= bands; k++) {
        bins[k] = Math.max(bins[k], bins[k - 1] + 1);
    }

    bins[bands] = hi;
    for (let k = bands - 1; k >= 1; k--) {
        bins[k] = Math.min(bins[k], bins[k + 1] - 1);
    }

    const ranges: BandRange[] = [];
    for (let k = 0; k < bands; k++) {
        ranges.push({ start: bins[k], end: bins[k + 1] });
    }
    return ranges;
}

export function computeBandRanges(
    binCount: number,
    sampleRate: number,
    bands: number,
    layout: BandLayout
): BandRange[] {
    if (!Number.isInteger(binCount) || binCount < 1) {
        throw new Error(
            `micugl audio: binCount must be a positive integer, received ${JSON.stringify(binCount)}`
        );
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
        throw new Error(
            `micugl audio: sampleRate must be a finite positive number, received ${JSON.stringify(sampleRate)}`
        );
    }
    if (!Number.isInteger(bands) || bands < 1) {
        throw new Error(
            `micugl audio: bands must be a positive integer, received ${JSON.stringify(bands)}`
        );
    }

    if (layout === 'linear') {
        if (binCount < bands) {
            throw new Error(
                `micugl audio: cannot split ${binCount} frequency bins into ${bands} non-empty bands. `
                + `An fftSize of ${binCount * 2} gives only ${binCount} bins; raise "fftSize".`
            );
        }
        const rawEdges: number[] = [];
        for (let k = 0; k <= bands; k++) {
            rawEdges.push((k * binCount) / bands);
        }
        return partitionBins(rawEdges, 0, binCount, bands);
    }

    const nyquist = sampleRate / 2;
    const hzPerBin = nyquist / binCount;
    const highHz = Math.min(nyquist, AUDIBLE_HIGH_HZ);
    const lo = Math.max(1, Math.floor(AUDIBLE_LOW_HZ / hzPerBin));
    const hi = Math.min(binCount, Math.ceil(highHz / hzPerBin));

    if (hi - lo < bands) {
        throw new Error(
            `micugl audio: an fftSize of ${binCount * 2} at a ${sampleRate} Hz sample rate leaves only `
            + `${Math.max(0, hi - lo)} frequency bin(s) between ${AUDIBLE_LOW_HZ} Hz and ${highHz} Hz, which cannot be `
            + `split into ${bands} non-empty log-spaced bands. Raise "fftSize", or use bandLayout "linear" to split `
            + 'the whole spectrum evenly instead.'
        );
    }

    const ratio = highHz / AUDIBLE_LOW_HZ;
    const rawEdges: number[] = [];
    for (let k = 0; k <= bands; k++) {
        rawEdges.push((AUDIBLE_LOW_HZ * ratio ** (k / bands)) / hzPerBin);
    }
    return partitionBins(rawEdges, lo, hi, bands);
}

export function reduceBands(freqData: Uint8Array, ranges: BandRange[], out: Float32Array): void {
    if (out.length !== ranges.length) {
        throw new Error(
            `micugl audio: reduceBands received ${ranges.length} band range(s) but an output buffer of length `
            + `${out.length}; they must match`
        );
    }

    for (let i = 0; i < ranges.length; i++) {
        const { start, end } = ranges[i];
        if (start < 0 || end <= start || end > freqData.length) {
            throw new Error(
                `micugl audio: band ${i} covers bins [${start}, ${end}), which is not a non-empty range inside the `
                + `${freqData.length}-bin frequency buffer`
            );
        }

        let sum = 0;
        for (let bin = start; bin < end; bin++) {
            sum += freqData[bin];
        }
        out[i] = sum / (end - start) / 255;
    }
}

export function applyEnvelope(
    env: number,
    target: number,
    dtSeconds: number,
    attack: number,
    release: number
): number {
    if (!(dtSeconds > 0)) {
        return env;
    }
    const tau = target > env ? attack : release;
    const coef = Math.exp(-dtSeconds / tau);
    return target + (env - target) * coef;
}

function validateSeconds(value: number, raw: number | undefined, name: string): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(
            `micugl audio: "${name}" must be a finite number of seconds >= 0, received ${JSON.stringify(raw)}. `
            + 'A value of 0 means "instant" (that edge of the envelope snaps straight to the new level).'
        );
    }
}

function validateName(value: string, key: string): void {
    if (value.trim() === '') {
        throw new Error(
            `micugl audio: "names.${key}" must be a non-empty uniform name, received ${JSON.stringify(value)}`
        );
    }
}

export function validateAudioOptions(options: AudioUniformsOptions = {}): ResolvedAudioOptions {
    const bands = options.bands ?? DEFAULT_BANDS;
    if (!Number.isInteger(bands) || bands < 1 || bands > MAX_BANDS) {
        throw new Error(
            `micugl audio: "bands" must be an integer between 1 and ${MAX_BANDS}, received ${JSON.stringify(options.bands)}. `
            + `The bands are packed into one float/vec2/vec3/vec4 uniform, which holds at most ${MAX_BANDS} components. `
            + 'More bands than that needs the full-spectrum texture path (the frequency data uploaded as a sampler2D), '
            + 'which micugl does not have yet.'
        );
    }

    const fftSize = options.fftSize ?? DEFAULT_FFT_SIZE;
    if (!isPowerOfTwo(fftSize) || fftSize < MIN_FFT_SIZE || fftSize > MAX_FFT_SIZE) {
        throw new Error(
            `micugl audio: "fftSize" must be a power of two between ${MIN_FFT_SIZE} and ${MAX_FFT_SIZE}, `
            + `received ${JSON.stringify(options.fftSize)}`
        );
    }

    const attack = options.attack ?? 0;
    validateSeconds(attack, options.attack, 'attack');
    const release = options.release ?? 0;
    validateSeconds(release, options.release, 'release');
    const envelopeEnabled = options.attack !== undefined || options.release !== undefined;

    const requestedSmoothing = options.smoothingTimeConstant;
    if (requestedSmoothing !== undefined && (!Number.isFinite(requestedSmoothing)
        || requestedSmoothing < 0 || requestedSmoothing > 1)) {
        throw new Error(
            `micugl audio: "smoothingTimeConstant" must be a number between 0 and 1, `
            + `received ${JSON.stringify(requestedSmoothing)}`
        );
    }
    if (envelopeEnabled && requestedSmoothing !== undefined && requestedSmoothing !== 0) {
        throw new Error(
            `micugl audio: "smoothingTimeConstant" (${requestedSmoothing}) cannot be combined with "attack"/"release". `
            + 'The envelope replaces the analyser\'s built-in smoothing, which is symmetric and cannot express a fast '
            + 'attack with a slow release, so micugl forces smoothingTimeConstant to 0 whenever attack or release is '
            + 'set, and your value would be silently ignored. Pass attack/release for an asymmetric envelope, or '
            + 'smoothingTimeConstant on its own for symmetric smoothing, but not both.'
        );
    }
    const smoothingTimeConstant = envelopeEnabled ? 0 : (requestedSmoothing ?? DEFAULT_SMOOTHING);

    const minDecibels = options.minDecibels ?? DEFAULT_MIN_DECIBELS;
    const maxDecibels = options.maxDecibels ?? DEFAULT_MAX_DECIBELS;
    if (!Number.isFinite(minDecibels) || !Number.isFinite(maxDecibels) || minDecibels >= maxDecibels) {
        throw new Error(
            `micugl audio: "minDecibels" (${JSON.stringify(minDecibels)}) must be a finite number strictly below `
            + `"maxDecibels" (${JSON.stringify(maxDecibels)}); the analyser maps that dB window onto the 0..255 byte `
            + 'range, so an inverted or empty window has no meaning.'
        );
    }

    const bandLayout = options.bandLayout ?? 'log';
    if (!Object.prototype.hasOwnProperty.call(BAND_LAYOUTS, bandLayout)) {
        throw new Error(
            `micugl audio: "bandLayout" must be "log" or "linear", received ${JSON.stringify(bandLayout)}`
        );
    }

    const names: ResolvedAudioNames = {
        bands: options.names?.bands ?? DEFAULT_BANDS_NAME,
        level: options.names?.level ?? DEFAULT_LEVEL_NAME
    };
    validateName(names.bands, 'bands');
    validateName(names.level, 'level');
    if (names.bands === names.level) {
        throw new Error(
            `micugl audio: "names.bands" and "names.level" are both "${names.bands}"; they must be different uniform `
            + 'names, or one would overwrite the other.'
        );
    }

    return {
        bands,
        fftSize,
        smoothingTimeConstant,
        attack,
        release,
        minDecibels,
        maxDecibels,
        bandLayout,
        names
    };
}
