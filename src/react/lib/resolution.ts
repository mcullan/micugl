import type { Dpr } from '@/types';

export const DEFAULT_DPR: [number, number] = [1, 2];
export const DEFAULT_MAX_PIXEL_COUNT = 8_294_400;

export interface ResolutionInputs {
    displayWidth: number;
    displayHeight: number;
    devicePixelRatio: number;
    dpr?: Dpr;
    maxPixelCount?: number;
    pixelRatioOverride?: number;
    disableDevicePixelRatio?: boolean;
}

export interface Resolution {
    renderWidth: number;
    renderHeight: number;
    dpr: number;
}

export function resolveDpr(
    devicePixelRatio: number,
    dpr: Dpr,
    pixelRatioOverride: number | undefined,
    disableDevicePixelRatio: boolean
): number {
    if (pixelRatioOverride !== undefined) {
        return pixelRatioOverride;
    }
    if (disableDevicePixelRatio) {
        return 1;
    }
    if (typeof dpr === 'number') {
        return dpr;
    }
    const [min, max] = dpr;
    return Math.min(Math.max(devicePixelRatio, min), max);
}

export function capPixelCount(
    width: number,
    height: number,
    maxPixelCount: number
): { width: number; height: number } {
    const pixelCount = width * height;
    if (pixelCount > maxPixelCount && pixelCount > 0) {
        const scale = Math.sqrt(maxPixelCount / pixelCount);
        return {
            width: Math.floor(width * scale),
            height: Math.floor(height * scale)
        };
    }
    return { width, height };
}

export function resolveResolution(inputs: ResolutionInputs): Resolution {
    const dpr = resolveDpr(
        inputs.devicePixelRatio,
        inputs.dpr ?? DEFAULT_DPR,
        inputs.pixelRatioOverride,
        inputs.disableDevicePixelRatio ?? false
    );
    const maxPixelCount = inputs.maxPixelCount ?? DEFAULT_MAX_PIXEL_COUNT;

    const capped = capPixelCount(
        Math.floor(inputs.displayWidth * dpr),
        Math.floor(inputs.displayHeight * dpr),
        maxPixelCount
    );

    return { renderWidth: capped.width, renderHeight: capped.height, dpr };
}

export interface DeviceResolutionInputs {
    deviceWidth: number;
    deviceHeight: number;
    devicePixelRatio: number;
    dpr?: Dpr;
    maxPixelCount?: number;
    pixelRatioOverride?: number;
    disableDevicePixelRatio?: boolean;
}

export function resolveDeviceResolution(inputs: DeviceResolutionInputs): Resolution {
    const dpr = resolveDpr(
        inputs.devicePixelRatio,
        inputs.dpr ?? DEFAULT_DPR,
        inputs.pixelRatioOverride,
        inputs.disableDevicePixelRatio ?? false
    );
    const scale = inputs.devicePixelRatio > 0 ? dpr / inputs.devicePixelRatio : 1;
    const maxPixelCount = inputs.maxPixelCount ?? DEFAULT_MAX_PIXEL_COUNT;

    const capped = capPixelCount(
        Math.floor(inputs.deviceWidth * scale),
        Math.floor(inputs.deviceHeight * scale),
        maxPixelCount
    );

    return { renderWidth: capped.width, renderHeight: capped.height, dpr };
}
