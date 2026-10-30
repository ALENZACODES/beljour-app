export function localTourTryon(mode = "mock") {
    return Object.freeze({
        kind: "tour-tryon",
        mode,
        preview(request) {
            if (mode === "off") {
                return {
                    result: "provider-disabled", providerCalls: 0, unitsSpent: 0, imageSent: false,
                    copy: "The provider branch is off. Local editing stays available.",
                };
            }
            if (!request.localConsent || !request.mockConsent || !request.identityLock || !request.selectedId) {
                return {
                    result: "consent-required", providerCalls: 0, unitsSpent: 0, imageSent: false,
                    copy: "Separate consent, a selected person and identity lock are required.",
                };
            }
            return {
                result: "mock-applied", providerCalls: 0, unitsSpent: 0, imageSent: false,
                copy: "Local illustration completed. No YouCam request was sent.",
            };
        },
    });
}
export function checkedTourOutcome(outcome) {
    if (!Number.isInteger(outcome.providerCalls) || outcome.providerCalls !== 0) {
        throw new Error("Live provider calls are not permitted in this tour");
    }
    if (!Number.isInteger(outcome.unitsSpent) || outcome.unitsSpent !== 0 || outcome.imageSent) {
        throw new Error("A mock tour cannot send an image or spend units");
    }
    if (!["mock-applied", "provider-disabled", "consent-required"].includes(outcome.result)) {
        throw new Error("Unsupported try-on status");
    }
    if (typeof outcome.copy !== "string" || outcome.copy.length > 240) {
        throw new Error("Invalid fixed mock status text");
    }
    return outcome;
}
export function canTryon(state, subjects) {
    return state.sourceLoaded && subjects.selectedId !== null
        && state.sourceRevision === subjects.revision
        && state.identityLock && state.permissions.local && state.permissions.mock;
}
//# sourceMappingURL=ports.js.map