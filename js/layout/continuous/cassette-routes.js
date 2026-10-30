/** Feature-flagged links only, no embedded provider client. Author: John Khan. */
import { realDemoRoute } from "../judge-live-routes.js";
const ALLOWED_ROUTES = ["hair", "makeup", "shade"];
/** Explicit navigation cannot inherit either the local drawn image or permission. */
export function safeProviderRoute(card, state, flags, visitorAcknowledged) {
    const base = {
        carriesPhoto: false,
        carriesConsent: false,
        startsProviderTask: false,
    };
    if (!flags.providerScreensEnabled) {
        return { ...base, href: null, label: "Live screen disabled", available: false,
            explanation: "The provider-aware screens are hidden until the public feature flag is enabled." };
    }
    if (!state.permissions.local || !state.permissions.mock || !state.identityLock) {
        return { ...base, href: null, label: "Consent required", available: false,
            explanation: "Complete this session's mock permissions; the real screen requires separate consent." };
    }
    if (!visitorAcknowledged) {
        return { ...base, href: null, label: "Confirm separate session", available: false,
            explanation: "A different page has its own consent, quote and unit checks." };
    }
    const routeId = card.route;
    if (!ALLOWED_ROUTES.includes(routeId)) {
        return { ...base, href: null, label: "Route unavailable", available: false,
            explanation: "Only reviewed public entry points are permitted." };
    }
    const route = realDemoRoute(routeId);
    if (!/^[a-z][\w-]*\.html(?:#[\w=/.-]+)?$/.test(route.href)
        || route.href.includes("..") || route.href.includes("//")) {
        return { ...base, href: null, label: "Route unavailable", available: false,
            explanation: "The public destination did not pass the same-origin route check." };
    }
    return { ...base, href: route.href, label: `Open ${route.title}`,
        available: true,
        explanation: "Opens a separate page only. Nothing from this mock tour is carried across." };
}
//# sourceMappingURL=cassette-routes.js.map