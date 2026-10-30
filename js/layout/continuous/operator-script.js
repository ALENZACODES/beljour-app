/** A usable manual verification script for real application entry points. */
import { OPERATOR_ROUTE_IDS, operatorRoutes } from "./operator-contract.js";
const TIMES = Object.freeze({
    photo: 20,
    studio: 25,
    hair: 30,
    makeup: 30,
    shade: 25,
    commerce: 25,
    trust: 25,
});
const KEYBOARD = Object.freeze({
    photo: "Use Tab to reach the image picker and Enter to activate it.",
    studio: "Use Tab to reach effects; operate range sliders with arrow keys.",
    hair: "Verify the separate consent checkbox before a task can run.",
    makeup: "Verify task actions are disabled without makeup consent.",
    shade: "Check each option has a clear accessible name and an honest status.",
    commerce: "Use Tab to reach products and the add-to-bag controls.",
    trust: "Check the delete control can be reached by keyboard alone.",
});
const CAPTIONS = Object.freeze({
    photo: "Start from a permitted photo, never the drawn demo image.",
    studio: "Show one actually supported editor operation and before/after.",
    hair: "Show the approved hair flow only after a fresh quote and consent.",
    makeup: "Show a supported makeup try-on, or an explicit unavailable result.",
    shade: "Check a real product catalogue entry, not a mock shade name.",
    commerce: "Demonstrate a non-billable product selection and bag update.",
    trust: "Show how a person can inspect privacy and request deletion.",
});
export function operatorScript() {
    const routes = operatorRoutes();
    return Object.freeze(routes.map((route, index) => Object.freeze({
        id: route.id,
        number: index + 1,
        caption: CAPTIONS[route.id],
        preflight: route.prerequisite,
        passCheck: route.confirmation,
        failure: route.fallback,
        accessibleHint: KEYBOARD[route.id],
        expectedSeconds: TIMES[route.id],
        providerRequiresConsent: route.boundary === "requires-consent",
    })));
}
/** The sum stays an explanatory rehearsal target, not a CI timing assertion. */
export function scriptTimingTotal() {
    return OPERATOR_ROUTE_IDS.reduce((sum, id) => sum + TIMES[id], 0);
}
export function operatorGaps(snapshot) {
    const missing = [];
    const refused = [];
    const selfReported = [];
    const advice = [];
    for (const route of snapshot.rows) {
        if (route.result === "not-started" || route.result === "opened")
            missing.push(route.id);
        if (route.result === "refused")
            refused.push(route.id);
        if (route.result === "self-reported")
            selfReported.push(route.id);
    }
    if (missing.length)
        advice.push("Complete or explicitly decline the unreviewed application screens.");
    if (refused.length)
        advice.push("Record real-product refusals without substituting the synthetic mock.");
    if (snapshot.clock.activeMs > 180_000) {
        advice.push("The manual rehearsal exceeded the three-minute target.");
    }
    advice.push("Separate evidence is still required for live YouCam, device quality and frozen faces.");
    return Object.freeze({
        missing: Object.freeze(missing),
        refused: Object.freeze(refused),
        selfReported: Object.freeze(selfReported),
        completeHumanChecklist: selfReported.length === OPERATOR_ROUTE_IDS.length,
        verifiedProvider: false,
        acceptedForRelease: false,
        advice: Object.freeze(advice),
    });
}
//# sourceMappingURL=operator-script.js.map