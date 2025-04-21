import { default as default_2 } from 'react';

declare const Ripple: default_2.FC<RippleProps>;
export { Ripple }
export default Ripple;

export declare interface RippleProps {
    damping?: number;
    mouseForce?: number;
    color1?: Vec3;
    color2?: Vec3;
    iterations?: number;
    className?: string;
    style?: default_2.CSSProperties;
}

declare type Vec3 = [number, number, number];

export { }
