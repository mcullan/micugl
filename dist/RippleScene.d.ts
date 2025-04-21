import { CSSProperties } from 'react';
import { JSX } from 'react/jsx-runtime';

declare const Ripple: ({ damping, mouseForce, color1, color2, iterations, className, style }: RippleProps) => JSX.Element;
export { Ripple }
export default Ripple;

export declare interface RippleProps {
    damping?: number;
    mouseForce?: number;
    color1?: Vec3;
    color2?: Vec3;
    iterations?: number;
    className?: string;
    style?: CSSProperties;
}

declare type Vec3 = [number, number, number];

export { }
