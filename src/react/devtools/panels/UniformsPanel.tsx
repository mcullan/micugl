import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { EngineHandle } from '@/react/devtools/beacon';
import { listEngines } from '@/react/devtools/beacon';
import { ColorField } from '@/react/devtools/controls/ColorField';
import { NumberField } from '@/react/devtools/controls/NumberField';
import { DEFAULT_VECTOR_LABELS, VectorField } from '@/react/devtools/controls/VectorField';
import { isColorUniform } from '@/react/devtools/lib/detectColor';
import { stepForType } from '@/react/devtools/lib/step';
import { activeButtonStyle, buttonStyle, COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';
import type { UniformDebugPort, UniformListEntry } from '@/react/lib/liveUniformUpdaters';

interface UniformsPanelProps {
    engine: EngineHandle | null;
}

type ColorMode = 'auto' | 'color' | 'number';

const formatReadonlyValue = (value: unknown): string => {
    if (typeof value === 'function') {
        return 'ƒ()';
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

interface UniformRowProps {
    entry: UniformListEntry;
    mode: ColorMode;
    error?: string;
    onToggleMode: (name: string) => void;
    onSetOverride: (name: string, value: number | ArrayLike<number>) => void;
    onClearOverride: (name: string) => void;
}

const UniformRow = ({ entry, mode, error, onToggleMode, onSetOverride, onClearOverride }: UniformRowProps): ReactElement => {
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
                {entry.type} · {formatReadonlyValue(entry.value)}
            </span>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={rowStyle}>
                <span style={{ color: entry.overridden ? COLORS.accent : COLORS.dim, fontSize: '11px' }}>
                    {entry.overridden ? '● ' : ''}{entry.name}
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

export const UniformsPanel = ({ engine }: UniformsPanelProps): ReactElement | null => {
    const [errorsByName, setErrorsByName] = useState<Record<string, string>>({});
    const [colorModeByName, setColorModeByName] = useState<Record<string, ColorMode>>({});
    const trackedRef = useRef<Map<string, Set<string>>>(new Map());

    useEffect(() => () => {
        for (const [engineId, names] of trackedRef.current) {
            const handle = listEngines().find(candidate => candidate.id === engineId);
            if (!handle?.uniforms) {
                continue;
            }
            for (const name of names) {
                if (handle.uniforms.list().some(entry => entry.name === name && entry.overridden)) {
                    handle.uniforms.clearOverride(name);
                }
            }
        }
        trackedRef.current = new Map();
    }, []);

    if (!engine?.uniforms) {
        return null;
    }

    const port: UniformDebugPort = engine.uniforms;
    const engineId = engine.id;
    const entries = port.list();

    const track = (name: string): void => {
        const names = trackedRef.current.get(engineId) ?? new Set<string>();
        names.add(name);
        trackedRef.current.set(engineId, names);
    };

    const clearError = (name: string): void => {
        setErrorsByName(prev => {
            if (!(name in prev)) {
                return prev;
            }
            const next = { ...prev };
            Reflect.deleteProperty(next, name);
            return next;
        });
    };

    const setError = (name: string, message: string): void => {
        setErrorsByName(prev => ({ ...prev, [name]: message }));
    };

    const handleSetOverride = (name: string, value: number | ArrayLike<number>): void => {
        try {
            port.setOverride(name, value);
            track(name);
            clearError(name);
        } catch (error) {
            setError(name, error instanceof Error ? error.message : String(error));
        }
    };

    const handleClearOverride = (name: string): void => {
        try {
            port.clearOverride(name);
            clearError(name);
        } catch (error) {
            setError(name, error instanceof Error ? error.message : String(error));
        }
    };

    const handleResetAll = (): void => {
        for (const entry of entries) {
            if (entry.overridden) {
                handleClearOverride(entry.name);
            }
        }
    };

    const handleToggleMode = (name: string): void => {
        setColorModeByName(prev => {
            const entry = entries.find(candidate => candidate.name === name);
            const current = prev[name] ?? 'auto';
            const currentlyColor = current === 'color' || (current === 'auto' && isColorUniform(name));
            const next: ColorMode = currentlyColor ? 'number' : 'color';
            return entry ? { ...prev, [name]: next } : prev;
        });
    };

    const anyOverridden = entries.some(entry => entry.overridden);

    return (
        <div style={sectionStyle}>
            <div style={rowStyle}>
                <span style={sectionTitleStyle}>uniforms</span>
                <button
                    type='button'
                    onClick={handleResetAll}
                    disabled={!anyOverridden}
                    style={anyOverridden ? activeButtonStyle : buttonStyle}
                >
                    reset all
                </button>
            </div>
            {entries.length === 0
                ? <div style={{ fontSize: '11px', color: COLORS.dim }}>no uniforms</div>
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {entries.map(entry => (
                            <UniformRow
                                key={entry.name}
                                entry={entry}
                                mode={colorModeByName[entry.name] ?? 'auto'}
                                error={errorsByName[entry.name]}
                                onToggleMode={handleToggleMode}
                                onSetOverride={handleSetOverride}
                                onClearOverride={handleClearOverride}
                            />
                        ))}
                    </div>
                )}
        </div>
    );
};
