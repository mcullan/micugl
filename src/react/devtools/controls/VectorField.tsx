import type { ReactElement } from 'react';

import { NumberField } from '@/react/devtools/controls/NumberField';
import type { ScrubModifiers } from '@/react/devtools/controls/useScrub';
import { stepForType } from '@/react/devtools/lib/step';
import type { UniformType } from '@/types';

export interface VectorFieldProps {
    value: Float32Array | readonly number[];
    length: number;
    type: UniformType;
    labels: readonly string[];
    onChange: (next: Float32Array) => void;
    ariaLabelPrefix: string;
}

export const DEFAULT_VECTOR_LABELS = ['x', 'y', 'z', 'w'] as const;

const toComponents = (value: Float32Array | readonly number[], length: number): Float32Array => {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        out[i] = value[i] ?? 0;
    }
    return out;
};

export const VectorField = ({ value, length, type, labels, onChange, ariaLabelPrefix }: VectorFieldProps): ReactElement => {
    const components = toComponents(value, length);

    const handleLaneChange = (index: number, next: number, modifiers?: ScrubModifiers): void => {
        const updated = new Float32Array(components);
        if (modifiers?.altKey) {
            const delta = next - components[index];
            for (let i = 0; i < length; i++) {
                updated[i] = components[i] + delta;
            }
        } else {
            updated[index] = next;
        }
        onChange(updated);
    };

    return (
        <div style={{ display: 'flex', gap: '4px' }}>
            {Array.from({ length }, (_, index) => (
                <div key={index} style={{ flex: 1, minWidth: '40px' }}>
                    <NumberField
                        value={components[index]}
                        step={stepForType(type, components[index])}
                        ariaLabel={`${ariaLabelPrefix} ${labels[index] ?? String(index)}`}
                        onChange={(next, modifiers) => { handleLaneChange(index, next, modifiers) }}
                    />
                </div>
            ))}
        </div>
    );
};
