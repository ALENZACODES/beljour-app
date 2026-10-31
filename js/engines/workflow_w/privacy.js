export function workflowEvent(action, feature, status, payloadBytes, createdAt = new Date().toISOString()) {
    const event = { action, feature, status, localOnly: true, payloadBytes, createdAt };
    validateWorkflowEvent(event);
    return event;
}
export function validateWorkflowEvent(value) {
    if (!/^W\d+$/.test(value.feature))
        throw new Error("feature must use a W id");
    if (!Number.isInteger(value.payloadBytes) || value.payloadBytes < 0 || value.payloadBytes > 2_000_000) {
        throw new Error("payload size is outside local workflow limit");
    }
    if (Number.isNaN(Date.parse(value.createdAt)))
        throw new Error("createdAt must be ISO-8601");
    if (value.localOnly !== true)
        throw new Error("workflow events must be local-only");
}
export function safeWorkflowEvent(value) {
    validateWorkflowEvent(value);
    return {
        action: value.action,
        feature: value.feature,
        status: value.status,
        localOnly: true,
        payloadBand: payloadBand(value.payloadBytes),
        createdAt: value.createdAt,
        containsPhoto: false,
        containsRecipe: false,
    };
}
export function payloadBand(size) {
    if (size === 0)
        return "empty";
    if (size <= 4_096)
        return "small";
    if (size <= 65_536)
        return "medium";
    return "large";
}
