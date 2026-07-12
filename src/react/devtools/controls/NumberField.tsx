import type { ChangeEvent, KeyboardEvent, WheelEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { ensureControlStyleInjected, NUMBER_FIELD_CLASS, NUMBER_FIELD_FLASH_CLASS } from '@/react/devtools/controls/controlStyles';
import type { ScrubModifiers } from '@/react/devtools/controls/useScrub';
import { normalizeZero, useScrub } from '@/react/devtools/controls/useScrub';
import { evaluate } from '@/react/devtools/lib/evaluate';
import { formatValue } from '@/react/devtools/lib/step';
import { COLORS, FONT } from '@/react/devtools/lib/theme';

export interface NumberFieldProps {
    value: number;
    step: number;
    onChange: (value: number, modifiers?: ScrubModifiers) => void;
    ariaLabel: string;
}

const FLASH_MS = 150;

const fieldStyle = {
    fontFamily: FONT,
    fontSize: '11px',
    padding: '3px 6px',
    background: 'rgba(0,0,0,0.3)',
    border: `1px solid ${COLORS.border}`,
    borderRadius: '4px',
    color: COLORS.text,
    width: '100%',
    boxSizing: 'border-box' as const
};

export const NumberField = ({ value, step, onChange, ariaLabel }: NumberFieldProps) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [dragValue, setDragValue] = useState<number | null>(null);
    const [hovered, setHovered] = useState(false);
    const [flash, setFlash] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleScrubChange = (next: number, modifiers?: ScrubModifiers): void => {
        setDragValue(next);
        onChange(next, modifiers);
    };

    const { dragging, onPointerDown, onPointerMove, onPointerUp, negate } = useScrub({
        value,
        step,
        onChange: handleScrubChange
    });

    useEffect(() => {
        ensureControlStyleInjected(inputRef.current?.getRootNode());
    }, []);

    useEffect(() => {
        if (!dragging) {
            setDragValue(null);
        }
    }, [dragging]);

    useEffect(() => {
        if (editing) {
            inputRef.current?.select();
        }
    }, [editing]);

    useEffect(() => () => {
        if (flashTimerRef.current !== null) {
            clearTimeout(flashTimerRef.current);
        }
    }, []);

    useEffect(() => {
        if (!hovered || editing || dragging) {
            return;
        }
        const onWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
            if (event.key !== '-' && event.key !== 'Subtract') {
                return;
            }
            if (document.activeElement === inputRef.current) {
                return;
            }
            event.preventDefault();
            onChange(normalizeZero(-value));
        };
        window.addEventListener('keydown', onWindowKeyDown);
        return () => { window.removeEventListener('keydown', onWindowKeyDown) };
    }, [hovered, editing, dragging, value, onChange]);

    const triggerFlash = (): void => {
        setFlash(true);
        if (flashTimerRef.current !== null) {
            clearTimeout(flashTimerRef.current);
        }
        flashTimerRef.current = setTimeout(() => { setFlash(false) }, FLASH_MS);
    };

    const enterEditing = (): void => {
        setDraft(formatValue(value, step));
        setEditing(true);
    };

    const commitDraft = (): void => {
        try {
            onChange(evaluate(draft));
        } catch {
            triggerFlash();
        }
        setEditing(false);
    };

    const revertDraft = (): void => {
        setEditing(false);
    };

    const applyKeyboardStep = (multiplier: number): void => {
        onChange(normalizeZero(value + step * multiplier));
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
        if (editing) {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                revertDraft();
            }
            return;
        }
        if (event.key === '-' || event.key === 'Subtract') {
            event.preventDefault();
            if (!negate()) {
                onChange(normalizeZero(-value));
            }
            return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const sign = event.key === 'ArrowUp' ? 1 : -1;
            const precision = event.shiftKey ? 0.1 : (event.ctrlKey || event.metaKey) ? 10 : 1;
            applyKeyboardStep(sign * precision);
            return;
        }
        if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault();
            applyKeyboardStep(event.key === 'PageUp' ? 10 : -10);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            enterEditing();
        }
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
        setDraft(event.target.value);
    };

    const handleBlur = (): void => {
        if (editing) {
            commitDraft();
        }
    };

    const handlePointerUp: typeof onPointerUp = event => {
        const outcome = onPointerUp(event);
        if (outcome === 'tap') {
            enterEditing();
        }
        return outcome;
    };

    const handleWheel = (event: WheelEvent<HTMLInputElement>): void => {
        if (editing) {
            return;
        }
        const precision = event.shiftKey ? 0.1 : 1;
        const delta = event.deltaY > 0 ? -1 : 1;
        onChange(normalizeZero(value + step * precision * delta));
    };

    const displayValue = editing
        ? draft
        : formatValue(dragging && dragValue !== null ? dragValue : value, step);

    const className = flash ? `${NUMBER_FIELD_CLASS} ${NUMBER_FIELD_FLASH_CLASS}` : NUMBER_FIELD_CLASS;

    return (
        <input
            ref={inputRef}
            className={className}
            role='spinbutton'
            aria-label={ariaLabel}
            aria-valuenow={value}
            tabIndex={0}
            readOnly={!editing}
            value={displayValue}
            style={{
                ...fieldStyle,
                cursor: dragging ? 'none' : 'ew-resize'
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={handlePointerUp}
            onPointerEnter={() => { setHovered(true) }}
            onPointerLeave={() => { setHovered(false) }}
            onKeyDown={handleKeyDown}
            onChange={handleChange}
            onBlur={handleBlur}
            onWheel={handleWheel}
        />
    );
};
