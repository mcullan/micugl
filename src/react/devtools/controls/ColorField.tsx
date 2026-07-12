import type { ChangeEvent, ReactElement } from 'react';

import { VectorField } from '@/react/devtools/controls/VectorField';
import { componentsToHex, hexToComponents, isOutOfGamut } from '@/react/devtools/lib/colorHex';
import { COLORS } from '@/react/devtools/lib/theme';

export interface ColorFieldProps {
    value: Float32Array | readonly number[];
    type: 'vec3' | 'vec4';
    onChange: (next: Float32Array) => void;
    ariaLabelPrefix: string;
}

const COLOR_LABELS = ['r', 'g', 'b', 'a'] as const;

export const ColorField = ({ value, type, onChange, ariaLabelPrefix }: ColorFieldProps): ReactElement => {
    const length = type === 'vec4' ? 4 : 3;
    const components = Array.from({ length }, (_, i) => value[i] ?? 0);
    const rgb = components.slice(0, 3);
    const hex = componentsToHex(rgb);
    const hdr = isOutOfGamut(rgb);

    const handlePick = (event: ChangeEvent<HTMLInputElement>): void => {
        const [r, g, b] = hexToComponents(event.target.value);
        const next = new Float32Array(length);
        next[0] = r;
        next[1] = g;
        next[2] = b;
        if (length === 4) {
            next[3] = components[3];
        }
        onChange(next);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                    type='color'
                    value={hex}
                    onChange={handlePick}
                    aria-label={`${ariaLabelPrefix} color picker`}
                    style={{
                        width: '22px',
                        height: '22px',
                        padding: 0,
                        border: `1px solid ${hdr ? COLORS.warn : COLORS.border}`,
                        borderRadius: '4px',
                        background: 'none',
                        cursor: 'pointer'
                    }}
                />
                {hdr ? <span style={{ fontSize: '9px', color: COLORS.warn }}>HDR, clamped preview</span> : null}
            </div>
            <VectorField
                value={value}
                length={length}
                type={type}
                labels={COLOR_LABELS}
                onChange={onChange}
                ariaLabelPrefix={ariaLabelPrefix}
            />
        </div>
    );
};
