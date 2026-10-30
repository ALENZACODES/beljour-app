/** Fixed, privacy-safe operator checks for the real application transfer. */
import { realDemoRoutes } from "../judge-live-routes.js";
export const OPERATOR_FORMAT = "beljour-operator-rehearsal/1";
export const OPERATOR_REFUSALS = [
    "no-consent", "offline", "unavailable", "not-verified",
];
export const OPERATOR_ROUTE_IDS = [
    "photo", "studio", "hair", "makeup", "shade", "commerce", "trust",
];
/** Local page URLs are constants imported from the existing public route list. */
export function operatorRoutes() {
    const routes = realDemoRoutes();
    const ids = new Set();
    const result = routes.map((route) => {
        if (!OPERATOR_ROUTE_IDS.includes(route.id)) {
            throw new Error("Unknown real-product route");
        }
        if (ids.has(route.id))
            throw new Error("Duplicate real-product route");
        ids.add(route.id);
        if (!isSafeOperatorHref(route.href))
            throw new Error("Unsafe real-product URL");
        return Object.freeze({
            id: route.id,
            title: route.title,
            boundary: route.boundary,
            href: route.href,
            prerequisite: route.prerequisite,
            confirmation: route.confirmation,
            fallback: route.fallback,
        });
    });
    if (result.length !== OPERATOR_ROUTE_IDS.length) {
        throw new Error("Real-product route coverage incomplete");
    }
    return Object.freeze(result);
}
/** No URL queries, origins, fragments with visitor data, or path traversal. */
export function isSafeOperatorHref(href) {
    if (typeof href !== "string" || href.length > 110)
        return false;
    if (href.includes("..") || href.includes("//") || href.includes("?"))
        return false;
    return /^[a-z][a-z-]*\.html(?:#[A-Za-z0-9_/-]+)?$/.test(href);
}
export function validOperatorResult(value) {
    return value === "not-started" || value === "opened"
        || value === "self-reported" || value === "refused";
}
export function validRefusal(value) {
    return OPERATOR_REFUSALS.some((entry) => entry === value);
}
/** Refusal explanations are fixed strings, never visitor text. */
export function operatorRefusalText(reason) {
    const descriptions = {
        "no-consent": "Separate consent has not been confirmed in the real page.",
        offline: "The real page or server could not be reached.",
        unavailable: "The real operation was unavailable or declined to process.",
        "not-verified": "The result could not be independently checked.",
    };
    return descriptions[reason];
}
//# sourceMappingURL=operator-contract.js.map