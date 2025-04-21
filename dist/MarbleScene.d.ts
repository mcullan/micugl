import { CSSProperties } from 'react';
import { JSX } from 'react/jsx-runtime';

declare const Marble: ({ marbleScale, tileScale, turbulence, swirl, veinFrequency, veinWidth, colorStart, colorEnd, veinColor, colorStartDark, colorEndDark, veinColorDark, className, style }: MarbleProps) => JSX.Element;
export { Marble }
export default Marble;

export declare interface MarbleProps {
    marbleScale?: number;
    tileScale?: number;
    turbulence?: number;
    swirl?: number;
    colorStart?: Vec3;
    colorEnd?: Vec3;
    veinColor?: Vec3;
    colorStartDark?: Vec3;
    colorEndDark?: Vec3;
    veinColorDark?: Vec3;
    veinFrequency?: number;
    veinWidth?: number;
    className?: string;
    style?: CSSProperties;
}

declare type Vec3 = [number, number, number];

export { }
