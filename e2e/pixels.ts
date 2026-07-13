import { inflateSync } from 'node:zlib';

export interface Bitmap {
    width: number;
    height: number;
    channels: number;
    data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) {
        return a;
    }
    return pb <= pc ? b : c;
};

const unfilter = (raw: Buffer, width: number, height: number, channels: number): Uint8Array => {
    const stride = width * channels;
    const out = new Uint8Array(stride * height);

    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = y * (stride + 1) + 1;
        const target = y * stride;

        for (let x = 0; x < stride; x++) {
            const value = raw[line + x];
            const left = x >= channels ? out[target + x - channels] : 0;
            const up = y > 0 ? out[target - stride + x] : 0;
            const upLeft = y > 0 && x >= channels ? out[target - stride + x - channels] : 0;

            let restored: number;
            switch (filter) {
                case 0: restored = value; break;
                case 1: restored = value + left; break;
                case 2: restored = value + up; break;
                case 3: restored = value + ((left + up) >> 1); break;
                case 4: restored = value + paeth(left, up, upLeft); break;
                default: throw new Error(`unsupported PNG filter type ${String(filter)} on row ${String(y)}`);
            }

            out[target + x] = restored & 0xff;
        }
    }

    return out;
};

export function decodePng(png: Buffer): Bitmap {
    for (let i = 0; i < SIGNATURE.length; i++) {
        if (png[i] !== SIGNATURE[i]) {
            throw new Error('not a PNG: bad signature');
        }
    }

    let offset = 8;
    let width = 0;
    let height = 0;
    let channels = 0;
    const chunks: Buffer[] = [];

    while (offset + 8 <= png.length) {
        const length = png.readUInt32BE(offset);
        const type = png.toString('ascii', offset + 4, offset + 8);
        const data = png.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;

        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            const bitDepth = data[8];
            const colorType = data[9];
            const interlace = data[12];

            if (bitDepth !== 8) {
                throw new Error(`unsupported PNG bit depth ${String(bitDepth)}`);
            }
            if (interlace !== 0) {
                throw new Error('unsupported interlaced PNG');
            }
            if (colorType === 6) {
                channels = 4;
            } else if (colorType === 2) {
                channels = 3;
            } else {
                throw new Error(`unsupported PNG color type ${String(colorType)}`);
            }
        } else if (type === 'IDAT') {
            chunks.push(Buffer.from(data));
        } else if (type === 'IEND') {
            break;
        }
    }

    if (width === 0 || height === 0 || channels === 0) {
        throw new Error('PNG has no IHDR chunk');
    }

    const raw = inflateSync(Buffer.concat(chunks));
    const expected = height * (width * channels + 1);
    if (raw.length !== expected) {
        throw new Error(`PNG payload is ${String(raw.length)} bytes, expected ${String(expected)}`);
    }

    return { width, height, channels, data: unfilter(raw, width, height, channels) };
}

const requireSameShape = (a: Bitmap, b: Bitmap): void => {
    if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
        throw new Error(
            `cannot compare bitmaps of different shapes: ${String(a.width)}x${String(a.height)}x`
            + `${String(a.channels)} vs ${String(b.width)}x${String(b.height)}x${String(b.channels)}`
        );
    }
};

export function differingPixelFraction(first: Buffer, second: Buffer, tolerance = 0): number {
    const a = decodePng(first);
    const b = decodePng(second);
    requireSameShape(a, b);

    const pixels = a.width * a.height;
    let differing = 0;

    for (let pixel = 0; pixel < pixels; pixel++) {
        const base = pixel * a.channels;
        for (let channel = 0; channel < 3; channel++) {
            if (Math.abs(a.data[base + channel] - b.data[base + channel]) > tolerance) {
                differing += 1;
                break;
            }
        }
    }

    return differing / pixels;
}

export function meanRgb(png: Buffer): [number, number, number] {
    const bitmap = decodePng(png);
    const pixels = bitmap.width * bitmap.height;
    const totals = [0, 0, 0];

    for (let pixel = 0; pixel < pixels; pixel++) {
        const base = pixel * bitmap.channels;
        totals[0] += bitmap.data[base];
        totals[1] += bitmap.data[base + 1];
        totals[2] += bitmap.data[base + 2];
    }

    return [totals[0] / pixels, totals[1] / pixels, totals[2] / pixels];
}

export function distinctColors(png: Buffer): number {
    const bitmap = decodePng(png);
    const pixels = bitmap.width * bitmap.height;
    const seen = new Set<number>();

    for (let pixel = 0; pixel < pixels; pixel++) {
        const base = pixel * bitmap.channels;
        seen.add((bitmap.data[base] << 16) | (bitmap.data[base + 1] << 8) | bitmap.data[base + 2]);
    }

    return seen.size;
}
