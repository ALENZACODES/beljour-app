const LABELS = {
    live: "Live result",
    recorded: "Recorded API example",
    local: "Local simulation",
    sample: "Sample, not a real result",
};
/** Endpoint ids as people read them. Unknown ids are shown as they are. */
const ENDPOINTS = {
    "makeup-vto": "YouCam Makeup Try On",
    "hair-style": "YouCam Hairstyle",
    "hair-color": "YouCam Hair Color",
    "hair-bang": "YouCam Hair Bangs",
    "hair-curl": "YouCam Hair Curl",
    "hair-extension": "YouCam Hair Extension",
    "hair-volume": "YouCam Hair Volume",
    "eye-color-vto": "YouCam Eye Colour",
    "beard-style": "YouCam Beard Styling",
    "local-warp": "our face shape warp",
    "local-photo-check": "our photo condition checks",
    "local-proportions": "our face measurements",
    "local-shade": "our shade estimate",
    "local-age": "our age-look simulation",
    "local-texture": "our texture simulation",
    "local-procedure": "our face shape simulation",
    // Retired recorded endpoints: provider name intentionally absent.
    "skin-analysis": "Recorded skin check",
    "skin-tone-analysis": "Recorded tone check",
    "face-attr-analysis": "Recorded face measurements",
    "face-reshape": "Recorded face edit",
    "face-lift": "Recorded face edit",
    "skin-simulation": "Recorded skin preview",
    "aging": "Recorded age preview",
    "teeth-whiten": "Recorded teeth preview",
};
/** Endpoints outside the styling scope whose recorded results are being replaced by local code
 *  (plan-r3-final §5.1). Mirrors api/plumb_api/provenance.py REPLACED_FEATURES. */
export const RETIRED_ENDPOINTS = new Set([
    "skin-analysis", "skin-tone-analysis", "face-attr-analysis", "face-reshape", "face-lift",
    "skin-simulation", "aging", "teeth-whiten",
]);
export function isRetired(p) {
    if (p.provider === "retired")
        return true;
    return p.source === "recorded" && (p.endpoint?.split("+").some((e) => RETIRED_ENDPOINTS.has(e)) ?? false);
}
export function endpointName(endpoint) {
    if (!endpoint)
        return "";
    return endpoint.split("+").map((e) => ENDPOINTS[e] ?? e).join(", then ");
}
export function units(n) {
    return `${n} unit${n === 1 ? "" : "s"}`;
}
export function badgeModel(p) {
    const tone = p.synthetic ? "sample" : p.source;
    const parts = [];
    const name = endpointName(p.endpoint);
    if (name)
        parts.push(name);
    if (p.source === "live")
        parts.push(p.cache_hit ? "repeat, no units used" : units(p.units));
    if (p.source === "recorded")
        parts.push("no units used");
    if (p.source === "local")
        parts.push("made by our own code, no YouCam call");
    if (p.created)
        parts.push(p.created);
    if (isRetired(p))
        return { tone: "recorded", label: "Unavailable saved result", detail: "This old example is no longer used. Run the local tool again.", simulation: null, aria: "Unavailable saved result. Run the local tool again." };
    const detail = parts.join(" · ");
    const simulation = p.simulation ? "Simulation. Not a prediction of real results." : null;
    return { tone, label: LABELS[tone], detail, simulation,
        aria: [LABELS[tone], detail, simulation].filter(Boolean).join(". ") };
}
/**
 * Replies without a provenance object (Plumb's older shape) map onto the same badge. Since
 * round 3 the server also sends `endpoint` and `lifecycle` at the top level; a caller that knows
 * which route it called can pass `endpointHint` for replies older than that.
 */
export function fromLegacyMeta(meta, endpointHint = null) {
    const source = meta.source === "demo" ? "recorded" : meta.source === "local" ? "local" : "live";
    const endpoint = meta.endpoint ?? endpointHint;
    const replaced = source === "recorded" && (meta.lifecycle !== undefined && meta.lifecycle !== "active"
        || (meta.lifecycle === undefined && !!endpoint && endpoint.split("+").some((e) => RETIRED_ENDPOINTS.has(e))));
    return {
        source, provider: source === "local" ? "local" : replaced ? "retired" : "youcam", endpoint, endpoint_version: null,
        pipeline_version: "", units: meta.units_spent, cache_hit: meta.source === "cache",
        synthetic: !!meta.synthetic, created: null, badge: "", simulation: false,
    };
}
/** API routes and the endpoint whose result they return, for replies with no endpoint field. */
export const ROUTE_ENDPOINTS = {
    "/api/skin/analyze": "skin-analysis",
    "/api/skin/simulate": "skin-simulation",
    "/api/shade/analyze": "skin-tone-analysis",
    "/api/face/proportions": "face-attr-analysis",
    "/api/transform/aging": "aging",
    "/api/makeup/try": "makeup-vto",
};
/** Fill `endpoint` on a reply from a known route when the server left it out (older servers). */
export function withEndpoint(route, body) {
    const meta = body;
    const hint = ROUTE_ENDPOINTS[route.split("?")[0]];
    if (!hint || !meta || typeof meta !== "object" || meta.source === undefined || meta.endpoint || meta.provenance)
        return body;
    return { ...body, endpoint: hint };
}
export function provenanceOf(meta, route) {
    return meta.provenance ?? fromLegacyMeta(meta, route ? ROUTE_ENDPOINTS[route] ?? null : null);
}
