import { CSSProperties } from 'react';
type Vec3 = [number, number, number];
export interface RippleProps {
    damping?: number;
    mouseForce?: number;
    color1?: Vec3;
    color2?: Vec3;
    iterations?: number;
    className?: string;
    style?: CSSProperties;
}
export declare const Ripple: ({ damping, mouseForce, color1, color2, iterations, className, style }: RippleProps) => import("react/jsx-runtime").JSX.Element;
export default Ripple;
