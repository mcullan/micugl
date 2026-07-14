import type { GraphPlan, PlannedInput, PlannedPass } from '@/core/lib/graphPlanning';
import {
    FIELD_SEPARATOR,
    framebuffersContentKey,
    programConfigsContentKey,
    textureSourcesContentKey
} from '@/react/lib/contentKeys';
import { serializeRenderOptions } from '@/react/lib/pingPongPasses';

const LIST_SEPARATOR = '\u0002';
const PASS_FIELD_SEPARATOR = '\u0003';
const SECTION_SEPARATOR = '\u0004';

function inputKey(input: PlannedInput): string {
    const id = input.kind === 'node' ? input.childId : input.sourceId;
    return [input.kind, id, input.samplerName, String(input.textureUnit)].join(FIELD_SEPARATOR);
}

function passKey(pass: PlannedPass): string {
    const inputs = pass.inputs.map(inputKey).join(LIST_SEPARATOR);
    const values = Object.entries(pass.valueUniforms)
        .map(([name, param]) => `${name}${FIELD_SEPARATOR}${param.type}`)
        .join(LIST_SEPARATOR);

    return [
        pass.nodeId,
        pass.outputFramebufferId ?? '',
        serializeRenderOptions(pass.renderOptions ?? {}),
        inputs,
        values
    ].join(PASS_FIELD_SEPARATOR);
}

export function graphStructureKey(plan: GraphPlan): string {
    return [
        programConfigsContentKey(plan.programConfigs),
        framebuffersContentKey(plan.framebuffers),
        textureSourcesContentKey(plan.sources),
        ...plan.passes.map(passKey)
    ].join(SECTION_SEPARATOR);
}
