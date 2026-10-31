/** Release readiness from local observation only. Author: John Khan. */
import { RELEASE_CHECKS } from "./catalogue.js";
export function evaluateReleaseReadiness(snapshot, commands, environment, sample) {
    const rows = RELEASE_CHECKS.map((definition) => {
        const observed = snapshot.rows.find((row) => row.id === definition.id);
        if (!observed)
            throw new RangeError("Incomplete release state");
        if (definition.classification !== "operator") {
            return {
                id: definition.id,
                state: "requires-external-evidence",
                explanation: definition.proofNeeded,
            };
        }
        if (observed.state === "refused") {
            return {
                id: definition.id,
                state: "refused",
                explanation: `${definition.recovery} Recorded refusal: `
                    + `${observed.refusal ?? "unclear-evidence"}.`,
            };
        }
        if (observed.state === "reviewed") {
            const commandNote = definition.id === "commands" && !commands.allAvailable
                ? " Pro Commands are not all available in the public owner catalogue."
                : "";
            return {
                id: definition.id,
                state: "self-reported",
                explanation: "Operator reported reviewing the screen. "
                    + "This is not independent acceptance." + commandNote,
            };
        }
        return {
            id: definition.id,
            state: "not-observed",
            explanation: observed.state === "opened"
                ? "The route was opened; required actions have not been confirmed."
                : "No real application action has been recorded in this rehearsal.",
        };
    });
    const reviewed = rows.filter((row) => row.state === "self-reported").length;
    const operatorTotal = RELEASE_CHECKS.filter((row) => row.classification === "operator").length;
    const independentPending = RELEASE_CHECKS.filter((row) => row.classification !== "operator").length;
    const deviceNote = sample?.status === "measured" && environment?.canvasAvailable
        ? " Local synthetic Canvas timing was recorded, not a device acceptance verdict."
        : " Local synthetic Canvas timing is absent or incomplete.";
    return {
        rows,
        reviewed,
        operatorTotal,
        independentPending,
        productionReady: false,
        confirmedProvider: false,
        confirmedRealFace: false,
        published: false,
        summary: `${reviewed} of ${operatorTotal} operator checks self-reported. `
            + `${independentPending} separate evidence checks remain external. `
            + "No production-release verdict is established." + deviceNote,
    };
}
