import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { EngineHandle } from '@/react/devtools/beacon';
import { listEngines } from '@/react/devtools/beacon';
import { isColorUniform } from '@/react/devtools/lib/detectColor';
import { activeButtonStyle, buttonStyle, COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';
import type { ColorMode } from '@/react/devtools/lib/UniformRow';
import { UniformRow } from '@/react/devtools/lib/UniformRow';
import type { UniformDebugPort } from '@/react/lib/liveUniformUpdaters';

interface UniformsPanelProps {
    engine: EngineHandle | null;
}

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
