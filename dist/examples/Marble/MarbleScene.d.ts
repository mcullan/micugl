import { CSSProperties } from 'react';
type Vec3 = [number, number, number];
export interface MarbleProps {
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
export declare const Marble: ({ marbleScale, tileScale, turbulence, swirl, veinFrequency, veinWidth, colorStart, colorEnd, veinColor, colorStartDark, colorEndDark, veinColorDark, className, style }: MarbleProps) => import("react/jsx-runtime").JSX.Element;
export default Marble;
