import { UNIFORM_COMPONENTS } from '@/core/lib/uniformComponents';
import { createCommonUpdaters } from '@/react/lib/createUniformUpdater';
import type { TransitionRuntime } from '@/react/lib/transitionRuntime';
import type {
    UniformParam,
    UniformType,
    UniformTypeMap,
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

export interface UniformListEntry {
    name: string;
    type: UniformType;
    value: unknown;
    overridden: boolean;
}

export interface UniformDebugPort {
    list: () => UniformListEntry[];
    setOverride: (name: string, value: unknown) => void;
    clearOverride: (name: string) => void;
}

export interface UniformDebugPortOptions {
    descriptorsRef: { current: UniformDescriptor[] };
    baseValuesRef: { current: LiveValues };
    overridesRef: { current: LiveValues };
    valuesRef: { current: LiveValues };
    onChange: () => void;
}

function coerceFiniteNumber(type: UniformType, value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(
            `micugl devtools: override for "${type}" uniform must be a finite number, received ${JSON.stringify(value)}`
        );
    }
    return parsed;
}

function isArrayLikeValue(value: unknown): value is ArrayLike<unknown> {
    return typeof value === 'object' && value !== null && 'length' in value;
}

export function validateOverrideValue(type: UniformType, value: unknown): UniformTypeMap[UniformType] {
    if (type === 'float') {
        return coerceFiniteNumber(type, value);
    }
    if (type === 'int' || type === 'sampler2D') {
        return Math.trunc(coerceFiniteNumber(type, value));
    }
    const length = UNIFORM_COMPONENTS[type];
    if (!isArrayLikeValue(value) || value.length !== length) {
        const gotLength = isArrayLikeValue(value) ? value.length : typeof value;
        throw new Error(
            `micugl devtools: override for "${type}" uniform expects ${length} components, received ${String(gotLength)}`
        );
    }
    const buffer = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = coerceFiniteNumber(type, value[i]);
    }
    return buffer as UniformTypeMap[UniformType];
}

export function mergeOverrides(base: LiveValues, overrides: LiveValues): LiveValues {
    return Object.keys(overrides).length === 0 ? base : { ...base, ...overrides };
}

export function createUniformDebugPort(options: UniformDebugPortOptions): UniformDebugPort {
    const findDescriptor = (name: string): UniformDescriptor => {
        const found = options.descriptorsRef.current.find(descriptor => descriptor.name === name);
        if (!found) {
            throw new Error(`micugl devtools: unknown uniform "${name}"`);
        }
        return found;
    };

    return {
        list: () => options.descriptorsRef.current.map(descriptor => ({
            name: descriptor.name,
            type: descriptor.type,
            value: options.valuesRef.current[descriptor.name],
            overridden: Object.prototype.hasOwnProperty.call(options.overridesRef.current, descriptor.name)
        })),
        setOverride: (name, value) => {
            const descriptor = findDescriptor(name);
            const validated = validateOverrideValue(descriptor.type, value);
            options.overridesRef.current[name] = validated;
            options.valuesRef.current = mergeOverrides(
                options.baseValuesRef.current,
                options.overridesRef.current
            );
            options.onChange();
        },
        clearOverride: name => {
            findDescriptor(name);
            Reflect.deleteProperty(options.overridesRef.current, name);
            options.valuesRef.current[name] = options.baseValuesRef.current[name];
            options.onChange();
        }
    };
}

export function combineUniformDebugPorts(ports: UniformDebugPort[]): UniformDebugPort {
    const portsWithName = (name: string): UniformDebugPort[] =>
        ports.filter(port => port.list().some(entry => entry.name === name));

    return {
        list: () => ports.flatMap(port => port.list()),
        setOverride: (name, value) => {
            const targets = portsWithName(name);
            if (targets.length === 0) {
                throw new Error(`micugl devtools: unknown uniform "${name}"`);
            }
            targets.forEach(port => { port.setOverride(name, value) });
        },
        clearOverride: name => {
            const targets = portsWithName(name);
            if (targets.length === 0) {
                throw new Error(`micugl devtools: unknown uniform "${name}"`);
            }
            targets.forEach(port => { port.clearOverride(name) });
        }
    };
}

export function normalizeUniformName(name: string): string {
    return name.startsWith('u_') ? name : `u_${name}`;
}

export function normalizeUniformParams(
    uniforms: Record<string, UniformParam>
): Record<string, UniformParam> {
    const normalized: Record<string, UniformParam> = {};
    for (const [name, param] of Object.entries(uniforms)) {
        normalized[normalizeUniformName(name)] = param;
    }
    return normalized;
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
    valuesRef: { current: LiveValues },
    runtime: TransitionRuntime
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
                const sampled = runtime.sample(name, time ?? 0);
                if (sampled !== null) {
                    return sampled as UniformTypeMap[UniformType];
                }
                const current = valuesRef.current[name];
                return typeof current === 'function'
                    ? current(time, width, height)
                    : current;
            }
        });
    }

    return updaters;
}
