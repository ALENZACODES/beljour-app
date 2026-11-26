/** A fixed, honest evidence checklist for the cached demo. Author: John Khan. */
import { CASSETTE_CARDS } from "./cassette-contract.js";
const MILESTONES = [
    { id: "drawn-source", title: "Drawn sample opened" },
    { id: "selected-person", title: "One person selected" },
    { id: "consent", title: "Local and mock permission confirmed" },
    { id: "seven-edits", title: "Seven local illustration stages applied" },
    { id: "hair-cache", title: "Drawn hair example reviewed" },
    { id: "makeup-cache", title: "Drawn makeup example reviewed" },
    { id: "skin-cache", title: "Drawn skin reference reviewed" },
    { id: "demo-bag", title: "Demonstration bag populated" },
    { id: "mock-tryon", title: "Mock or off-path checked" },
    { id: "compare", title: "Original and edited drawing compared" },
    { id: "export", title: "Labelled local image download requested" },
];
function observedCard(snapshot, id) {
    return snapshot.observed.includes(id);
}
function bagObserved(bag) {
    return bag.items.length > 0 && bag.items.every((item) => item.demonstrationOnly
        && !item.priceKnown && !item.purchaseAvailable);
}
export function cassetteJourney(state, session) {
    const applied = Object.values(state.applied).filter(Boolean).length;
    const lookup = {
        "drawn-source": session.loaded && state.sourceLoaded,
        "selected-person": session.loaded && state.sourceLoaded && state.selectedId !== null,
        consent: state.permissions.local && state.permissions.mock && state.identityLock,
        "seven-edits": applied === 7,
        "hair-cache": observedCard(session, CASSETTE_CARDS[0].id),
        "makeup-cache": observedCard(session, CASSETTE_CARDS[1].id),
        "skin-cache": observedCard(session, CASSETTE_CARDS[2].id),
        "demo-bag": bagObserved(session.bag),
        "mock-tryon": state.mockResult === "mock-applied" || state.mockResult === "provider-disabled",
        compare: state.completed.includes("compare"),
        export: state.requestedDownload,
    };
    const rows = MILESTONES.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        status: lookup[milestone.id] ? "observed" : "missing",
        explanation: lookup[milestone.id]
            ? "Local visitor action recorded; this is not independent quality evidence."
            : "Not observed in this disposable drawn demonstration.",
    }));
    return Object.freeze({
        format: "beljour-cassette-journey/1",
        rows: Object.freeze(rows),
        observedCount: rows.filter((row) => row.status === "observed").length,
        totalCount: MILESTONES.length,
        photoUploaded: false,
        providerUnits: 0,
        verifiedProvider: false,
        verifiedFaceQuality: false,
        releasePassed: false,
    });
}
/** This readable summary cannot accidentally imply production verification. */
export function cassetteJourneyCaption(journey) {
    if (journey.format !== "beljour-cassette-journey/1" || journey.totalCount !== MILESTONES.length
        || journey.providerUnits !== 0 || journey.photoUploaded || journey.verifiedProvider
        || journey.verifiedFaceQuality || journey.releasePassed) {
        throw new Error("Untrusted rehearsal journey");
    }
    if (!Number.isSafeInteger(journey.observedCount) || journey.observedCount < 0
        || journey.observedCount > journey.totalCount)
        throw new Error("Invalid journey count");
    if (journey.rows.length !== MILESTONES.length)
        throw new Error("Unexpected journey rows");
    for (const [index, row] of journey.rows.entries()) {
        if (row.id !== MILESTONES[index].id || row.title !== MILESTONES[index].title
            || !["observed", "missing"].includes(row.status)) {
            throw new Error("Unrecognized journey row");
        }
    }
    const counted = journey.rows.filter((row) => row.status === "observed").length;
    if (counted !== journey.observedCount)
        throw new Error("Inconsistent journey count");
    return `${counted} of ${MILESTONES.length} drawn-demo actions observed. `
        + "Provider units: 0. Live integration and real-face gates: unverified.";
}
//# sourceMappingURL=cassette-journey.js.map