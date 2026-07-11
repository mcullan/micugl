import type { CSSProperties } from 'react';

export const COLORS = {
    bg: 'rgba(15,17,26,0.94)',
    panel: 'rgba(24,27,38,0.9)',
    border: '#2a2f42',
    text: '#c9cee2',
    dim: '#828aa6',
    accent: '#5b8def',
    good: '#3ecf8e',
    warn: '#e9a23b',
    danger: '#e94560'
};

export const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const sectionStyle: CSSProperties = {
    borderTop: `1px solid ${COLORS.border}`,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
};

export const sectionTitleStyle: CSSProperties = {
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: COLORS.dim
};

export const rowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px'
};

export const buttonStyle: CSSProperties = {
    fontFamily: FONT,
    fontSize: '11px',
    padding: '3px 7px',
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '4px',
    color: COLORS.text,
    cursor: 'pointer'
};

export const activeButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: COLORS.accent,
    border: `1px solid ${COLORS.accent}`,
    color: '#0b0d16'
};
