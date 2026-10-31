/** Deterministic, provider-free refusal demonstrations for a local rehearsal.
 * These represent potential UX states; they are not recorded YouCam outcomes.
 */
export const MOCK_FAILURE_CASES = [
    {
        id: "unit-limit", label: "Illustrate an exhausted allowance",
        cause: "Simulated unit limit reached before a provider task begins.",
        visitorMessage: "This demonstration has no available styling units. Your original is safe.",
        recovery: "Keep the original, check the actual quote, and retry only if units become available.",
    },
    {
        id: "offline", label: "Illustrate lost connectivity",
        cause: "Simulated connection unavailable; no request was attempted.",
        visitorMessage: "The cloud-style action cannot run without a connection. Local edits are still available.",
        recovery: "Continue editing locally and retry only with a working connection and fresh permission.",
    },
    {
        id: "consent", label: "Illustrate withheld permission",
        cause: "Simulated user refusal to send a photo for styling.",
        visitorMessage: "No styling request will start without a separate, explicit photo permission.",
        recovery: "Use local tools, or return to the real application's consent step.",
    },
    {
        id: "timeout", label: "Illustrate an unfinished task",
        cause: "Simulated task deadline elapsed before a result was returned.",
        visitorMessage: "No result is available. The original remains unchanged; no success is claimed.",
        recovery: "Review the actual task status rather than starting another chargeable request automatically.",
    },
    {
        id: "bad-response", label: "Illustrate an unusable result",
        cause: "Simulated response rejected by the browser contract.",
        visitorMessage: "The proposed output cannot be displayed. The original remains available.",
        recovery: "Stop the action and report an unsupported result; never display invented provider pixels.",
    },
];
const INITIAL_STATE = {
    phase: "idle",
    scenario: null,
    reason: "",
    message: "Choose an optional refusal rehearsal. The regular mock try-on remains separate.",
    recovery: "",
    preservesOriginal: true,
    requestsSent: 0,
    providerResultClaimed: false,
};
export class JudgeFailureReplay {
    state = INITIAL_STATE;
    disposed = false;
    snapshot() {
        return { ...this.state };
    }
    /** No timers, random outcomes, adapter calls or image mutations. */
    simulate(id) {
        if (this.disposed)
            return false;
        const caseInfo = MOCK_FAILURE_CASES.find((item) => item.id === id);
        if (!caseInfo)
            return false;
        this.state = {
            phase: "simulated-refusal",
            scenario: caseInfo.id,
            reason: caseInfo.cause,
            message: caseInfo.visitorMessage,
            recovery: caseInfo.recovery,
            preservesOriginal: true,
            requestsSent: 0,
            providerResultClaimed: false,
        };
        return true;
    }
    /** Records that a manual retry is possible, not that any retry ran. */
    acknowledge() {
        if (this.disposed || this.state.phase !== "simulated-refusal")
            return false;
        this.state = {
            ...this.state,
            phase: "ready-to-retry",
            message: "The mock can be requested again manually. No provider retry occurred.",
        };
        return true;
    }
    reset() {
        if (this.disposed)
            return;
        this.state = INITIAL_STATE;
    }
    dispose() {
        this.reset();
        this.disposed = true;
    }
}
export function validateFailureReplay(snapshot) {
    if (snapshot.preservesOriginal !== true || snapshot.requestsSent !== 0)
        return false;
    if (snapshot.providerResultClaimed !== false)
        return false;
    if (snapshot.phase === "idle")
        return snapshot.scenario === null;
    if (!snapshot.scenario)
        return false;
    const item = MOCK_FAILURE_CASES.find((entry) => entry.id === snapshot.scenario);
    if (!item)
        return false;
    return snapshot.reason === item.cause && snapshot.recovery === item.recovery;
}
