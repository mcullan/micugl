import { createCommonUpdaters } from '@/react/lib/createUniformUpdater';
import type {
    UniformParam,
    UniformType,
    UniformUpdaterDef,
    UniformValue
} from '@/types';

const HEAD_PREFIX = '__skip=';
const ENTRY_SEPARATOR = ',';
const FIELD_SEPARATOR = '=';

export interface UniformDescriptor {
    name: string;
    type: UniformType;
}

export type LiveValues = Record<string, UniformValue<UniformType>>;

export function normalizeUniformName(name: string): string {
    return name.startsWith('u_') ? name : `u_${name}`;
}

export function uniformDescriptors(uniforms: Record<string, UniformParam>): UniformDescriptor[] {
    return Object.entries(uniforms).map(([name, param]) => ({
        name: normalizeUniformName(name),
        type: param.type
    }));
}

export function collectLiveValues(uniforms: Record<string, UniformParam>): LiveValues {
    const values: LiveValues = {};
    for (const [name, param] of Object.entries(uniforms)) {
        values[normalizeUniformName(name)] = param.value;
    }
    return values;
}

export function uniformStructureKey(descriptors: UniformDescriptor[], skipDefaults: boolean): string {
    const head = `${HEAD_PREFIX}${skipDefaults ? '1' : '0'}`;
    const body = descriptors.map(d => `${d.name}${FIELD_SEPARATOR}${d.type}`);
    return [head, ...body].join(ENTRY_SEPARATOR);
}

export function parseUniformStructureKey(
    key: string
): { skipDefaults: boolean; descriptors: UniformDescriptor[] } {
    const parts = key.split(ENTRY_SEPARATOR);
    const skipDefaults = parts[0] === `${HEAD_PREFIX}1`;
    const descriptors: UniformDescriptor[] = [];

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (part.length === 0) {
            continue;
        }
        const separatorIndex = part.indexOf(FIELD_SEPARATOR);
        descriptors.push({
            name: part.slice(0, separatorIndex),
            type: part.slice(separatorIndex + 1) as UniformType
        });
    }

    return { skipDefaults, descriptors };
}

export function buildLiveUpdaters(
    descriptors: UniformDescriptor[],
    skipDefaults: boolean,
    valuesRef: { current: LiveValues }
): UniformUpdaterDef[] {
    const hasName = (name: string): boolean => descriptors.some(d => d.name === name);

    const updaters: UniformUpdaterDef[] = skipDefaults
        ? []
        : createCommonUpdaters().filter(u =>
            (u.name === 'u_time' && !hasName('u_time'))
            || (u.name === 'u_resolution' && !hasName('u_resolution'))
        );

    for (const { name, type } of descriptors) {
        updaters.push({
            name,
            type,
            updateFn: (time, width, height) => {
                const current = valuesRef.current[name];
                return typeof current === 'function'
                    ? current(time, width, height)
                    : current;
            }
        });
    }

    return updaters;
}
