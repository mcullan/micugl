import { default as React } from 'react';
type Vec3 = [number, number, number];
export interface RippleProps {
    damping?: number;
    mouseForce?: number;
    color1?: Vec3;
    color2?: Vec3;
    iterations?: number;
    className?: string;
    style?: React.CSSProperties;
}
export declare const Ripple: React.FC<RippleProps>;
export default Ripple;
