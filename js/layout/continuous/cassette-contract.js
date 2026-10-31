export const CASSETTE_CARDS = Object.freeze([
    Object.freeze({
        id: "drawn-hair", family: "hair", title: "Hair colour idea",
        explanation: "Saved illustration of a colour placement on a drawn figure. No hair transfer was performed.",
        productType: "Colour consultation", relatedPermission: "hair", route: "hair",
        scene: "drawn-pair", provenance: "local-drawn",
        label: "ILLUSTRATION · NOT A PROVIDER RESULT",
        testedOnRealFaces: false, providerCalls: 0, unitsSpent: 0, containsPhoto: false,
    }),
    Object.freeze({
        id: "drawn-makeup", family: "makeup", title: "Makeup placement idea",
        explanation: "Saved cheek and lip placement guide; cosmetic performance and shade fit are unverified.",
        productType: "Cosmetic colour sample", relatedPermission: "face", route: "makeup",
        scene: "drawn-pair", provenance: "local-drawn",
        label: "ILLUSTRATION · NOT A PROVIDER RESULT",
        testedOnRealFaces: false, providerCalls: 0, unitsSpent: 0, containsPhoto: false,
    }),
    Object.freeze({
        id: "drawn-skin", family: "skin", title: "Skin match concept",
        explanation: "A catalogue-category example, not a Skin AI reading or a verified product match.",
        productType: "Complexion reference", relatedPermission: "face", route: "shade",
        scene: "drawn-pair", provenance: "local-drawn",
        label: "ILLUSTRATION · NOT A PROVIDER RESULT",
        testedOnRealFaces: false, providerCalls: 0, unitsSpent: 0, containsPhoto: false,
    }),
]);
export function cassetteById(value) {
    if (typeof value !== "string")
        return null;
    return CASSETTE_CARDS.find((card) => card.id === value) ?? null;
}
export function cassetteAuthority(state) {
    if (!state.sourceLoaded || state.selectedId === null)
        return null;
    if (!Number.isSafeInteger(state.sourceRevision) || state.sourceRevision < 1)
        return null;
    if (state.selectedId !== "drawn-main" && state.selectedId !== "drawn-second")
        return null;
    return Object.freeze({
        sourceRevision: state.sourceRevision,
        subjectId: state.selectedId,
        scene: "drawn-pair",
    });
}
export function cassettePermission(state, card) {
    if (!cassetteAuthority(state))
        return "no-source";
    if (!state.permissions.local || !state.permissions[card.relatedPermission]
        || (state.mockMode === "mock" && !state.permissions.mock))
        return "consent-required";
    if (!state.identityLock)
        return "identity-lock-required";
    return "ready";
}
/** An external object cannot elevate an authored illustration to a vendor result. */
export function checkedCassetteCard(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("Invalid offline cassette card");
    }
    const input = value;
    const card = cassetteById(input.id);
    if (!card || Object.keys(input).length !== Object.keys(card).length) {
        throw new RangeError("Unrecognized offline cassette entry");
    }
    for (const [key, expected] of Object.entries(card)) {
        if (input[key] !== expected)
            throw new RangeError("Offline cassette fields do not match the local source");
    }
    return card;
}
export function statusCopy(status) {
    switch (status) {
        case "ready": return "Cached illustration ready. Zero provider requests and zero units.";
        case "no-source": return "Open the drawn sample and select a figure first.";
        case "consent-required": return "Local and relevant edit consent are required; mock mode also requires mock consent.";
        case "identity-lock-required": return "Identity lock must be on for this illustration.";
        case "invalid-source": return "The sample or selected person changed. Reload the local cache.";
        case "cache-miss": return "No cached result. This tour never falls back to a live request.";
        case "disposed": return "This demonstration session has ended.";
    }
}
