import type { ReactElement } from 'react';

import { ColorField } from '@/react/devtools/controls/ColorField';
import { NumberField } from '@/react/devtools/controls/NumberField';
import { DEFAULT_VECTOR_LABELS, VectorField } from '@/react/devtools/controls/VectorField';
import { isColorUniform } from '@/react/devtools/lib/detectColor';
import { stepForType } from '@/react/devtools/lib/step';
import { buttonStyle, COLORS, rowStyle } from '@/react/devtools/lib/theme';
import type { UniformListEntry } from '@/react/lib/liveUniformUpdaters';

export type ColorMode = 'auto' | 'color' | 'number';

const formatReadonlyValue = (value: unknown): string => {
    if (typeof value === 'function') {
        return '\u0192()';
    }
    if (typeof value === 'number') {
        return value.toFixed(3);
    }
    if (ArrayBuffer.isView(value)) {
        return Array.from(value as unknown as ArrayLike<number>)
            .map(component => component.toFixed(2))
            .join(', ');
    }
    return String(value);
};

const toComponentArray = (value: unknown, length: number): Float32Array => {
    const out = new Float32Array(length);
    if (ArrayBuffer.isView(value)) {
        const view = value as unknown as ArrayLike<number>;
        for (let i = 0; i < length; i++) {
            out[i] = view[i] ?? 0;
        }
    } else if (Array.isArray(value)) {
        for (let i = 0; i < length; i++) {
            out[i] = typeof value[i] === 'number' ? value[i] as number : 0;
        }
    }
    return out;
};

export interface UniformRowProps {
    entry: UniformListEntry;
    mode: ColorMode;
    error?: string;
    onToggleMode: (name: string) => void;
    onSetOverride: (name: string, value: number | ArrayLike<number>) => void;
    onClearOverride: (name: string) => void;
}

export const UniformRow = ({
    entry,
    mode,
    error,
    onToggleMode,
    onSetOverride,
    onClearOverride
}: UniformRowProps): ReactElement => {
    const resetButton = entry.overridden
        ? (
            <button type='button' onClick={() => { onClearOverride(entry.name) }} style={buttonStyle}>
                reset
            </button>
        )
        : null;

    let control: ReactElement;
    let modeToggle: ReactElement | null = null;

    if (entry.type === 'float' || entry.type === 'int') {
        control = (
            <div style={{ width: '96px' }}>
                <NumberField
                    value={typeof entry.value === 'number' ? entry.value : 0}
                    step={stepForType(entry.type, typeof entry.value === 'number' ? entry.value : 0)}
                    ariaLabel={entry.name}
                    onChange={value => { onSetOverride(entry.name, value) }}
                />
            </div>
        );
    } else if (entry.type === 'vec2') {
        control = (
            <VectorField
                value={toComponentArray(entry.value, 2)}
                length={2}
                type={entry.type}
                labels={DEFAULT_VECTOR_LABELS}
                ariaLabelPrefix={entry.name}
                onChange={next => { onSetOverride(entry.name, next) }}
            />
        );
    } else if (entry.type === 'vec3' || entry.type === 'vec4') {
        const length = entry.type === 'vec4' ? 4 : 3;
        const colorEligible = mode === 'color' || (mode === 'auto' && isColorUniform(entry.name));
        control = colorEligible
            ? (
                <ColorField
                    value={toComponentArray(entry.value, length)}
                    type={entry.type}
                    ariaLabelPrefix={entry.name}
                    onChange={next => { onSetOverride(entry.name, next) }}
                />
            )
            : (
                <VectorField
                    value={toComponentArray(entry.value, length)}
                    length={length}
                    type={entry.type}
                    labels={DEFAULT_VECTOR_LABELS}
                    ariaLabelPrefix={entry.name}
                    onChange={next => { onSetOverride(entry.name, next) }}
                />
            );
        modeToggle = (
            <button type='button' onClick={() => { onToggleMode(entry.name) }} style={buttonStyle}>
                {colorEligible ? 'as vector' : 'as color'}
            </button>
        );
    } else {
        control = (
            <span style={{ fontSize: '11px', color: COLORS.dim }}>
                {entry.type} {'\u00b7'} {formatReadonlyValue(entry.value)}
            </span>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={rowStyle}>
                <span style={{ color: entry.overridden ? COLORS.accent : COLORS.dim, fontSize: '11px' }}>
                    {entry.overridden ? '\u25cf ' : ''}{entry.name}
                </span>
                {modeToggle}
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                {control}
                {resetButton}
            </div>
            {error ? <div style={{ fontSize: '10px', color: COLORS.danger }}>{error}</div> : null}
        </div>
    );
};
