/** Safe, public entry points for a separate real-product judge rehearsal.
 * Navigating here never transports the illustrated image or its permissions.
 */
import { destination } from "./client-routes.js";
const ROUTES = [
    {
        id: "photo", clientId: "classic", title: "Start the real Photo lab",
        boundary: "on-device", purpose: "Open a new photo with the regular application, not this local illustration.",
        prerequisite: "Use an authorized adult photo and complete the visit consent screen.",
        confirmation: "Verify the original remains available after local selection.",
        fallback: "If the photo cannot be read, stop; do not claim it was imported.",
    },
    {
        id: "studio", clientId: "studio", title: "Try the real local Studio",
        boundary: "on-device", purpose: "Use a supported local effect and compare against the original.",
        prerequisite: "Choose a supported edit with the required source geometry.",
        confirmation: "Confirm the preview reflects a real edit and the original can be restored.",
        fallback: "If the engine refuses missing geometry, preserve that refusal in the demonstration.",
    },
    {
        id: "hair", clientId: "hair", title: "Open hair styling",
        boundary: "requires-consent", purpose: "Visit the separate provider-aware hair experience.",
        prerequisite: "Use separate per-photo hair consent and obtain an approved quote before any request.",
        confirmation: "Check actual request, returned status and output in the real application.",
        fallback: "If units or connectivity are unavailable, show the refusal, not the mock overlay as proof.",
    },
    {
        id: "makeup", clientId: "makeup", title: "Open makeup try-on",
        boundary: "requires-consent", purpose: "Visit the actual provider-aware makeup workflow.",
        prerequisite: "Give fresh makeup consent and check units before starting the live task.",
        confirmation: "Verify a real provider result and the product value it enables.",
        fallback: "If the task fails, report it as unavailable; do not reuse the mock result.",
    },
    {
        id: "shade", clientId: "shade", title: "Check shade matching",
        boundary: "on-device", purpose: "Inspect the currently available shade and product choices.",
        prerequisite: "Open a suitable photo. Provider-dependent options need their own permission.",
        confirmation: "Check that any product match is traceable to an actual available catalogue entry.",
        fallback: "Keep estimated and unavailable suggestions visibly separate from measured results.",
    },
    {
        id: "commerce", ownHref: "commerce.html", title: "Review the commerce flow",
        boundary: "third-party-page", purpose: "Show the distinct product-bag experience where available.",
        prerequisite: "Use the commerce page's own entry flow and do not assume shared photo consent.",
        confirmation: "Check actual catalogue products and a non-billable add-to-bag interaction.",
        fallback: "If this page is unavailable on the build, mark that check unobserved.",
    },
    {
        id: "trust", clientId: "trust", title: "Open the Trust Centre",
        boundary: "information", purpose: "Review privacy controls, retention and deletion instructions.",
        prerequisite: "No demo photo, consent receipt or private image is transferred with this link.",
        confirmation: "Read the actual deployed policy and exercise the relevant delete control.",
        fallback: "Do not claim a privacy policy is legally approved from this client check.",
    },
];
function hrefFor(template) {
    if (template.ownHref)
        return template.ownHref;
    const link = destination(template.clientId ?? "");
    if (!link)
        throw new Error(`Unregistered client route: ${template.id}`);
    return link.href;
}
/** The returned string is never built from visitor input. */
export function realDemoRoute(id) {
    const template = ROUTES.find((route) => route.id === id);
    if (!template)
        throw new RangeError("Unknown real-demo route");
    return {
        id: template.id,
        title: template.title,
        href: hrefFor(template),
        boundary: template.boundary,
        purpose: template.purpose,
        prerequisite: template.prerequisite,
        confirmation: template.confirmation,
        fallback: template.fallback,
        liveVerified: false,
        carriesPhoto: false,
        carriesConsent: false,
    };
}
export function realDemoRoutes() {
    return ROUTES.map((template) => realDemoRoute(template.id));
}
export function validateRealDemoRoutes() {
    const issues = [];
    const keys = new Set();
    for (const template of ROUTES) {
        if (keys.has(template.id))
            issues.push(`Duplicate route ${template.id}`);
        keys.add(template.id);
        if (Boolean(template.clientId) === Boolean(template.ownHref)) {
            issues.push(`Ambiguous entry for ${template.id}`);
        }
        if (!template.title || !template.purpose || !template.confirmation || !template.fallback) {
            issues.push(`Incomplete description for ${template.id}`);
        }
        let href = "";
        try {
            href = hrefFor(template);
        }
        catch {
            issues.push(`Missing public destination for ${template.id}`);
            continue;
        }
        if (!/^[a-z][a-z-]*\.html(?:#(?:\/)?[\w=/-]+)?$/.test(href)) {
            issues.push(`Nonlocal or malformed destination ${template.id}`);
        }
        if (href.includes("..") || href.includes("//") || href.includes("?")) {
            issues.push(`Untrusted destination ${template.id}`);
        }
    }
    return issues;
}
//# sourceMappingURL=judge-live-routes.js.map