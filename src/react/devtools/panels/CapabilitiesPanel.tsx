import type { ReactElement } from 'react';

import type { TextureCapabilities } from '@/core/lib/textureCapabilities';
import { COLORS, rowStyle, sectionStyle, sectionTitleStyle } from '@/react/devtools/lib/theme';

interface CapabilitiesPanelProps {
    capabilities: TextureCapabilities;
    floatFilterDowngraded: boolean;
}

const bool = (value: boolean): ReactElement => (
    <span style={{ color: value ? COLORS.good : COLORS.danger }}>{value ? 'yes' : 'no'}</span>
);

const capRow = (label: string, value: boolean): ReactElement => (
    <div key={label} style={rowStyle}>
        <span style={{ color: COLORS.dim }}>{label}</span>
        {bool(value)}
    </div>
);

export const CapabilitiesPanel = ({ capabilities, floatFilterDowngraded }: CapabilitiesPanelProps): ReactElement => {
    return (
        <div style={sectionStyle}>
            <div style={sectionTitleStyle}>capabilities</div>
            <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {capRow('float renderable', capabilities.floatRenderable)}
                {capRow('half-float renderable', capabilities.halfFloatRenderable)}
                {capRow('float linear', capabilities.floatLinearFilterable)}
                {capRow('half-float linear', capabilities.halfFloatLinearFilterable)}
                {capRow('half-float type set', capabilities.halfFloatType !== 0)}
            </div>
            {floatFilterDowngraded
                ? (
                    <div style={{
                        fontSize: '11px',
                        color: '#0b0d16',
                        background: COLORS.warn,
                        borderRadius: '4px',
                        padding: '4px 6px',
                        fontWeight: 600
                    }}>
                        float filter downgraded to NEAREST
                    </div>
                )
                : null}
        </div>
    );
};
