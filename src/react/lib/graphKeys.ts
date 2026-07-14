import type { GraphPlan, PlannedInput } from '@/core/lib/graphPlanning';
import {
    ENTRY_SEPARATOR,
    FIELD_SEPARATOR,
    framebuffersContentKey,
    programConfigsContentKey
} from '@/react/lib/contentKeys';

function inputKey(input: PlannedInput): string {
    const id = input.kind === 'node' ? input.childId : input.sourceId;
    return [input.kind, id, input.samplerName, String(input.textureUnit)].join(FIELD_SEPARATOR);
}

export function graphStructureKey(plan: GraphPlan): string {
    const passKeys = plan.passes.map(pass => {
        const inputs = pass.inputs.map(inputKey).join(FIELD_SEPARATOR);
        const values = Object.entries(pass.valueUniforms)
            .map(([name, param]) => `${name}${FIELD_SEPARATOR}${param.type}`)
            .join(FIELD_SEPARATOR);
        return [
            pass.nodeId,
            pass.outputFramebufferId ?? '',
            inputs,
            values
        ].join(FIELD_SEPARATOR);
    });

    return [
        programConfigsContentKey(plan.programConfigs),
        framebuffersContentKey(plan.framebuffers),
        ...passKeys
    ].join(ENTRY_SEPARATOR);
}
