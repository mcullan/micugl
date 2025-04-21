import { jsx as _jsx } from "react/jsx-runtime";
import { createShaderConfig } from '@/core/lib/createShaderConfig';
import { vec3 } from '@/core/lib/vectorUtils';
import { BaseShaderComponent } from '@/react/components/base/BaseShaderComponent';
import { useDarkMode } from '@/react/hooks/useDarkMode';
import { marbleFragmentShader, marbleVertexShader } from './marbleShaders';
const COLOR_START = [0.8, 0.8, 0.9];
const COLOR_END = [0.3, 0.3, 0.6];
const VEIN_COLOR = [0.1, 0.1, 0.3];
const COLOR_START_DARK = [0.2, 0.2, 0.3];
const COLOR_END_DARK = [0.1, 0.1, 0.2];
const VEIN_COLOR_DARK = [0.05, 0.05, 0.1];
export const Marble = ({ marbleScale = 3.0, tileScale = 1.0, turbulence = 0.5, swirl = 6.0, veinFrequency = 6.0, veinWidth = 2.0, colorStart = COLOR_START, colorEnd = COLOR_END, veinColor = VEIN_COLOR, colorStartDark = COLOR_START_DARK, colorEndDark = COLOR_END_DARK, veinColorDark = VEIN_COLOR_DARK, className = '', style }) => {
    const isDarkMode = useDarkMode();
    const shaderConfig = createShaderConfig({
        vertexShader: marbleVertexShader,
        fragmentShader: marbleFragmentShader,
        uniformNames: {
            u_marbleScale: 'float',
            u_tileScale: 'float',
            u_turbulence: 'float',
            u_swirl: 'float',
            u_colorStart: 'vec3',
            u_colorEnd: 'vec3',
            u_veinColor: 'vec3',
            u_veinFrequency: 'float',
            u_veinWidth: 'float'
        }
    });
    return (_jsx(BaseShaderComponent, { programId: 'marble-shader', shaderConfig: shaderConfig, className: className, style: style, uniforms: {
            marbleScale: { value: marbleScale, type: 'float' },
            tileScale: { value: tileScale, type: 'float' },
            turbulence: { value: turbulence, type: 'float' },
            swirl: { value: swirl, type: 'float' },
            veinFrequency: { value: veinFrequency, type: 'float' },
            veinWidth: { value: veinWidth, type: 'float' },
            colorStart: {
                type: 'vec3',
                value: vec3(isDarkMode ? colorStartDark : colorStart)
            },
            colorEnd: {
                type: 'vec3',
                value: vec3(isDarkMode ? colorEndDark : colorEnd)
            },
            veinColor: {
                type: 'vec3',
                value: vec3(isDarkMode ? veinColorDark : veinColor)
            }
        } }));
};
export default Marble;
//# sourceMappingURL=MarbleScene.js.map