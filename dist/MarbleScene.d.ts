import { default as default_2 } from 'react';

declare const Marble: default_2.FC<MarbleProps>;
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
    style?: default_2.CSSProperties;
}

declare type Vec3 = [number, number, number];

export { }
