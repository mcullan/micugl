import { normalizeUniformName, normalizeUniformParams } from '@/react/lib/liveUniformUpdaters';
import type { RenderPass, UniformParam, WorkerMode } from '@/types';
import type { WorkerSupportScope } from '@/worker/createWorker';
import { createOnceLogger, isWorkerModeSupported } from '@/worker/createWorker';
import type { UniformScalar, UniformVector } from '@/worker/protocol';
import {
    isWorkerBuiltinUniformName,
    normalizeCloneSafeUniformValue,
    WORKER_BUILTIN_UNIFORM_NAMES
} from '@/worker/protocol';
import { functionUniformErrorMessage } from '@/worker/WorkerBridge';

export type WorkerProgramUniforms = Record<string, Record<string, UniformParam>>;

export type WorkerUniformValues = Record<string, UniformScalar | UniformVector | ArrayBufferView>;

export interface WorkerLiveUniforms {
    programId: string;
    names: string[];
}

export type WorkerBlock =
    | { kind: 'uniforms-missing' }
    | { kind: 'fast-path' }
    | { kind: 'instancing' }
    | { kind: 'live-uniform-unknown'; name: string }
    | { kind: 'uniform-function'; programId: string; name: string }
    | { kind: 'uniform-builtin-function'; programId: string; name: string }
    | { kind: 'uniform-not-clone-safe'; programId: string; name: string }
    | { kind: 'uniform-transition'; programId: string; name: string }
    | { kind: 'pass-uniform-function'; programId: string; passIndex: number; name: string }
    | { kind: 'pass-uniform-not-clone-safe'; programId: string; passIndex: number; name: string };

export interface WorkerBlockInputs {
    uniforms: WorkerProgramUniforms | undefined;
    fastPath: boolean;
    instancing: boolean;
    liveUniforms?: WorkerLiveUniforms;
    passes?: RenderPass[];
}

const transferredCanvases = new WeakSet<HTMLCanvasElement>();

const logOnce = createOnceLogger(message => { console.warn(message) });

let workerModeSupportedMemo: boolean | undefined;

export function workerModeSupported(): boolean {
    workerModeSupportedMemo ??= isWorkerModeSupported(globalThis as WorkerSupportScope);
    return workerModeSupportedMemo;
}

export function resolveWorkerMode(mode: WorkerMode | undefined, supported: boolean, blocked: boolean): boolean {
    if (mode === undefined || mode === false) {
        return false;
    }
    if (mode === true) {
        return true;
    }
    return supported && !blocked;
}

export function isWorkerRequested(mode: WorkerMode | undefined): boolean {
    return mode === true || mode === 'auto';
}

export function normalizeLiveUniformNames(names: string[] | undefined): string[] {
    return (names ?? []).map(normalizeUniformName);
}

export function normalizeWorkerPrograms(uniforms: WorkerProgramUniforms): WorkerProgramUniforms {
    const normalized: WorkerProgramUniforms = {};
    for (const [programId, params] of Object.entries(uniforms)) {
        normalized[programId] = normalizeUniformParams(params);
    }
    return normalized;
}

export function stripPassUniforms(passes: RenderPass[]): RenderPass[] {
    return passes.map(({ uniforms: _uniforms, ...pass }) => pass);
}

function isLiveName(live: WorkerLiveUniforms | undefined, programId: string, name: string): boolean {
    return live !== undefined && live.programId === programId && live.names.includes(name);
}

function findLiveUniformBlock(inputs: WorkerBlockInputs): WorkerBlock | null {
    const live = inputs.liveUniforms;
    if (!live || !inputs.uniforms) {
        return null;
    }

    const params = inputs.uniforms[live.programId] as Record<string, UniformParam> | undefined;
    for (const name of live.names) {
        if (!params || !(name in params)) {
            return { kind: 'live-uniform-unknown', name };
        }
    }
    return null;
}

function findProgramUniformBlock(inputs: WorkerBlockInputs): WorkerBlock | null {
    for (const [programId, params] of Object.entries(inputs.uniforms ?? {})) {
        for (const [name, param] of Object.entries(params)) {
            if (param.transition !== undefined) {
                return { kind: 'uniform-transition', programId, name };
            }
            if (typeof param.value === 'function') {
                if (isWorkerBuiltinUniformName(name)) {
                    return { kind: 'uniform-builtin-function', programId, name };
                }
                if (isLiveName(inputs.liveUniforms, programId, name)) {
                    continue;
                }
                return { kind: 'uniform-function', programId, name };
            }
            if (normalizeCloneSafeUniformValue(param.value) === null) {
                return { kind: 'uniform-not-clone-safe', programId, name };
            }
        }
    }
    return null;
}

function findPassUniformBlock(passes: RenderPass[]): WorkerBlock | null {
    for (let passIndex = 0; passIndex < passes.length; passIndex++) {
        const pass = passes[passIndex];
        for (const [name, uniform] of Object.entries(pass.uniforms ?? {})) {
            if (typeof uniform.value === 'function') {
                return { kind: 'pass-uniform-function', programId: pass.programId, passIndex, name };
            }
            if (normalizeCloneSafeUniformValue(uniform.value) === null) {
                return { kind: 'pass-uniform-not-clone-safe', programId: pass.programId, passIndex, name };
            }
        }
    }
    return null;
}

export function findWorkerBlock(inputs: WorkerBlockInputs): WorkerBlock | null {
    if (!inputs.uniforms) {
        return { kind: 'uniforms-missing' };
    }
    if (!inputs.fastPath) {
        return { kind: 'fast-path' };
    }
    if (inputs.instancing) {
        return { kind: 'instancing' };
    }

    return findLiveUniformBlock(inputs)
        ?? findProgramUniformBlock(inputs)
        ?? findPassUniformBlock(inputs.passes ?? []);
}

function passLabel(programId: string, passIndex: number): string {
    return `pass ${String(passIndex)} (program "${programId}")`;
}

function builtinUniformFunctionMessage(programId: string, name: string): string {
    const builtins = WORKER_BUILTIN_UNIFORM_NAMES.join(', ');
    return `micugl worker: uniform "${name}" on program "${programId}" is a function, but `
        + `${builtins} are computed inside the worker from the frame clock and the canvas size. A worker cannot `
        + `call your function, so it would be ignored and "${name}" would not be the value you wrote. `
        + `Give "${name}" a plain value (number, number[], or typed array), or turn off worker mode on `
        + 'this component so the main thread can call it every frame.';
}

function uniformTransitionMessage(programId: string, name: string): string {
    return `micugl worker: uniform "${name}" on program "${programId}" has a "transition", but transitions are `
        + 'interpolated on the main thread every frame and worker mode posts plain values; the transition would '
        + `be ignored and "${name}" would jump straight to its new value. Remove the transition, or turn off `
        + 'worker mode on this component.';
}

function notCloneSafeMessage(programId: string, name: string): string {
    return `micugl worker: uniform "${name}" on program "${programId}" is not structured-clone-safe, so it `
        + 'cannot be posted to a worker. Worker-mode uniform values must be a number, a number[], or a typed '
        + 'array. Convert it, or turn off worker mode on this component.';
}

function passUniformFunctionMessage(programId: string, passIndex: number, name: string): string {
    return `micugl worker: pass uniform "${name}" on ${passLabel(programId, passIndex)} is a function, and a `
        + 'worker cannot call it. Sending the pass without it would silently render a different picture: micugl '
        + `would either drop "${name}" or substitute its own built-in, which is not the value your function `
        + `returns. Give "${name}" a plain value (number, number[], or typed array), drop "customPasses" so `
        + 'micugl builds the ping-pong passes (their uniforms are posted to the worker for you), or turn off '
        + 'worker mode on this component.';
}

function passUniformNotCloneSafeMessage(programId: string, passIndex: number, name: string): string {
    return `micugl worker: pass uniform "${name}" on ${passLabel(programId, passIndex)} is not `
        + 'structured-clone-safe, so it cannot be posted to a worker. Render-pass uniform values must be a '
        + 'number, a number[], or a typed array. Convert it, or turn off worker mode on this component.';
}

function uniformsMissingMessage(component: string): string {
    return `${component}: worker mode needs the raw uniform params in the "workerUniforms" prop, because uniform `
        + 'updater functions cannot cross a worker boundary. Pass workerUniforms, or turn off worker mode.';
}

function fastPathMessage(component: string): string {
    return `${component}: worker mode requires useFastPath. A custom renderCallback runs on the main thread and `
        + 'cannot be sent to a worker. Set useFastPath, or turn off worker mode.';
}

function instancingMessage(component: string): string {
    return `${component}: "instancing" is not supported in worker mode (v1). Remove the "instancing" prop, or `
        + 'turn off worker mode on this component.';
}

function missingLiveUniformMessage(name: string): string {
    return `micugl worker: "${name}" is listed in the "liveUniforms" prop but is not one of the component's `
        + 'uniforms, so nothing would ever be sent for it. Add it to "uniforms", or remove it from "liveUniforms".';
}

export function workerBlockMessage(component: string, block: WorkerBlock): string {
    switch (block.kind) {
        case 'uniforms-missing':
            return uniformsMissingMessage(component);
        case 'fast-path':
            return fastPathMessage(component);
        case 'instancing':
            return instancingMessage(component);
        case 'live-uniform-unknown':
            return missingLiveUniformMessage(block.name);
        case 'uniform-function':
            return functionUniformErrorMessage(block.programId, block.name);
        case 'uniform-builtin-function':
            return builtinUniformFunctionMessage(block.programId, block.name);
        case 'uniform-not-clone-safe':
            return notCloneSafeMessage(block.programId, block.name);
        case 'uniform-transition':
            return uniformTransitionMessage(block.programId, block.name);
        case 'pass-uniform-function':
            return passUniformFunctionMessage(block.programId, block.passIndex, block.name);
        case 'pass-uniform-not-clone-safe':
            return passUniformNotCloneSafeMessage(block.programId, block.passIndex, block.name);
    }
}

export interface WorkerPingPongUniformsOptions {
    programId: string;
    uniforms: Record<string, UniformParam>;
    secondaryProgramId?: string;
    secondaryUniforms?: Record<string, UniformParam>;
    customPasses: boolean;
}

export function workerPingPongUniforms(options: WorkerPingPongUniformsOptions): WorkerProgramUniforms {
    const programs: WorkerProgramUniforms = {
        [options.programId]: options.customPasses ? {} : options.uniforms
    };

    if (options.secondaryProgramId !== undefined) {
        programs[options.secondaryProgramId] = options.customPasses
            ? {}
            : (options.secondaryUniforms ?? {});
    }

    return programs;
}

export function workerHandleUnsupportedMessage(component: string, method: string): string {
    return `${component}.${method}: not supported in worker mode (v1). It needs a WebGL context on the main `
        + 'thread, and in worker mode the context lives in the worker. Turn off worker mode on this component to '
        + `use ${method}.`;
}

export function workerGetFrameMessage(component: string): string {
    return `${component}.getFrame: not available in worker mode. The render clock lives in the worker and cannot `
        + 'be read synchronously from the main thread. Drive the clock instead: setFrame(frame) posts a '
        + 'deterministic frame to the worker.';
}

export function warnWorkerDevtoolsUnavailable(): void {
    logOnce(
        'micugl worker: "debug" is set on a worker-rendered component, but worker-rendered engines cannot be '
        + 'inspected: the devtools read a main-thread WebGL context and in worker mode the context lives in the '
        + 'worker. Turn off worker mode on this component to inspect it.'
    );
}

function alreadyTransferredMessage(): string {
    return 'micugl worker: this <canvas> was already transferred to a worker. transferControlToOffscreen() is '
        + 'permanent, so it can only ever be called once per element, and micugl gives each worker session a '
        + 'fresh <canvas>. Reaching this means a micugl lifecycle bug: please report it.';
}

export function transferCanvasToWorker(canvas: HTMLCanvasElement): OffscreenCanvas {
    if (transferredCanvases.has(canvas)) {
        throw new Error(alreadyTransferredMessage());
    }
    transferredCanvases.add(canvas);
    return canvas.transferControlToOffscreen();
}

export function collectWorkerValues(uniforms: Record<string, UniformParam>): WorkerUniformValues {
    const values: WorkerUniformValues = {};
    for (const [name, param] of Object.entries(uniforms)) {
        if (typeof param.value === 'function') {
            continue;
        }
        values[name] = param.value;
    }
    return values;
}

export function sampleLiveUniforms(
    names: string[],
    uniforms: Record<string, UniformParam>,
    time: number,
    width: number,
    height: number
): WorkerUniformValues {
    const values: WorkerUniformValues = {};

    for (const name of names) {
        const param = uniforms[name];
        values[name] = typeof param.value === 'function'
            ? param.value(time, width, height)
            : param.value;
    }

    return values;
}
