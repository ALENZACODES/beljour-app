/** Release verification categories for the public browser handoff. Author: John Khan. */
import { realDemoRoute } from "../judge-live-routes.js";
const CHECKS = [
    {
        id: "upload", title: "Open and retain the original", classification: "operator", route: "photo",
        expectation: "An authorized photo opens in the normal photo flow.",
        proofNeeded: "Inspect the original, its local state and the error on an unsupported file.",
        recovery: "Return to the original without replacing it with the illustration.",
    },
    {
        id: "subjects", title: "Select one person", classification: "operator", route: "studio",
        expectation: "A checked subject is selected and all bystanders stay unchanged.",
        proofNeeded: "Check actual detected boxes, the selection and saved bystander pixels.",
        recovery: "If no verified detector result exists, refuse per-face edits.",
    },
    {
        id: "consent", title: "Separate local and provider permissions",
        classification: "operator", route: "trust",
        expectation: "Each provider action asks permission for the current image and scope.",
        proofNeeded: "Observe denial and grant paths, then withdraw and retry.",
        recovery: "On-device operations stay available; a rejected provider request spends nothing.",
    },
    {
        id: "local-edit", title: "Apply a local edit with identity lock",
        classification: "operator", route: "studio",
        expectation: "Every visible strength uses 1.0 to 5.0 with 0.1 increments and the lock starts on.",
        proofNeeded: "Apply a genuine engine effect and compare it to the unchanged original.",
        recovery: "An unsupported engine refuses without modifying the user's photograph.",
    },
    {
        id: "hair", title: "Check hair try-on", classification: "operator", route: "hair",
        expectation: "The real styling path has a quote, separate consent and a typed result.",
        proofNeeded: "Observe a real allowed task or a truthful refusal when units are exhausted.",
        recovery: "A mock or diagram cannot replace proof of a provider result.",
    },
    {
        id: "makeup", title: "Check makeup try-on", classification: "operator", route: "makeup",
        expectation: "The actual provider adapter handles consent, cost and result status.",
        proofNeeded: "Review source-to-result provenance from the production route.",
        recovery: "When unavailable, show the refusal and preserve the original image.",
    },
    {
        id: "skin-match", title: "Inspect shade and skin recommendations",
        classification: "operator", route: "shade",
        expectation: "Only actual available catalogue products appear as buyable matches.",
        proofNeeded: "Distinguish local estimates from returned Skin AI observations.",
        recovery: "Keep unavailable provider recommendations explicitly labelled.",
    },
    {
        id: "commerce", title: "Review products and demo bag", classification: "operator", route: "commerce",
        expectation: "A non-billable bag uses real catalogue entries, not fabricated brand data.",
        proofNeeded: "Check an available product card and the add/remove controls.",
        recovery: "Do not claim checkout or production payment processing.",
    },
    {
        id: "compare", title: "Inspect before and after", classification: "operator", route: "studio",
        expectation: "The unmodified source remains available when comparing a real edit.",
        proofNeeded: "Test the comparison slider, keyboard controls and original preservation.",
        recovery: "If the preview fails, the unmodified source is still viewable.",
    },
    {
        id: "download", title: "Request a local image export", classification: "operator", route: "studio",
        expectation: "Simulation is burned into image pixels where needed.",
        proofNeeded: "Confirm the saved file is delivered and opens in a separate viewer.",
        recovery: "A click or blob creation alone is not proof of a saved file.",
    },
    {
        id: "commands", title: "Inspect five Pro Commands", classification: "operator", route: "studio",
        expectation: "Each named command is wired through its actual public owner interface.",
        proofNeeded: "Confirm versioned runtime responses, not this client's capability listing.",
        recovery: "When the public interface is unavailable, leave commands unverified.",
    },
    {
        id: "performance", title: "Measure on a physical phone", classification: "device", route: null,
        expectation: "First load, preview and 12 MP export meet the declared target budgets.",
        proofNeeded: "Collect median, p95, device, OS and network conditions on the actual phone.",
        recovery: "Synthetic Canvas timing cannot substitute for device performance evidence.",
    },
    {
        id: "accessibility", title: "Complete keyboard and screen-reader pass",
        classification: "device", route: null,
        expectation: "The page supports keyboard access and WCAG 2.2 AA review.",
        proofNeeded: "Test the supported mobile browsers and at least one real screen reader.",
        recovery: "Automated DOM checks never count as certification.",
    },
    {
        id: "real-face", title: "Frozen 100,000-face release evidence",
        classification: "independent", route: null,
        expectation: "The frozen-set runner and every registered slice pass on approved external faces.",
        proofNeeded: "Independent, locked complete-run results and accepted regression baseline.",
        recovery: "Do not publish or infer pass from drawn fixtures or incomplete shards.",
    },
    {
        id: "commercial-ip", title: "Commercial licence and model clearance",
        classification: "independent", route: null,
        expectation: "Every distributed model, dataset, asset and dependency has cleared rights.",
        proofNeeded: "Review the exact artifact hashes, provenance ledger and outstanding decisions.",
        recovery: "Disable an uncleared asset. Do not mark an unresolved decision accepted.",
    },
    {
        id: "submission", title: "Verify Devpost submission assets",
        classification: "independent", route: null,
        expectation: "Working link, permitted live API, source, video and descriptions agree.",
        proofNeeded: "Human review and actual live deployment evidence before submission.",
        recovery: "An unpublished or synthetic-only rehearsal is not a submitted entry.",
    },
];
export const RELEASE_CHECKS = Object.freeze(CHECKS);
export const RELEASE_CHECK_IDS = Object.freeze(CHECKS.map((row) => row.id));
export const RELEASE_REFUSALS = Object.freeze([
    "offline", "consent-required", "feature-unavailable", "invalid-source",
    "device-unsupported", "permission-denied", "unclear-evidence",
]);
export function releaseCheck(id) {
    const row = RELEASE_CHECKS.find((candidate) => candidate.id === id);
    if (!row)
        throw new RangeError("Unknown release check");
    return row;
}
export function isReleaseId(value) {
    return RELEASE_CHECK_IDS.some((id) => id === value);
}
export function isReleaseRefusal(value) {
    return RELEASE_REFUSALS.some((reason) => reason === value);
}
/** Links come from the existing public client-route registry, never visitor text. */
export function releaseLink(id) {
    const route = releaseCheck(id).route;
    if (!route)
        return null;
    const href = realDemoRoute(route).href;
    if (!/^[a-z][a-z-]*\.html(?:#[A-Za-z0-9=/\-]+)?$/.test(href)) {
        throw new Error("Untrusted release destination");
    }
    if (href.includes("..") || href.includes("//"))
        throw new Error("Unsafe release destination");
    return href;
}
//# sourceMappingURL=catalogue.js.map