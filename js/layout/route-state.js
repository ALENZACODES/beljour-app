/** The classic URL route is a fixed union of public screen names.
 * Unknown hashes are never forwarded to feature implementations.
 */
import { STEPS, routeReady } from "../ctx.js";
export const START_ROUTE = "photo";
export function parseClassicRoute(hash) {
    const raw = hash.startsWith("#/") ? hash.slice(2) : "";
    if (raw === "privacy")
        return "privacy";
    const found = STEPS.find((step) => step.route === raw);
    return found?.route ?? START_ROUTE;
}
export function resolveClassicRoute(hash, ctx) {
    const requested = parseClassicRoute(hash);
    if (routeReady(ctx, requested)) {
        return { requested, destination: requested, redirected: false, reason: null };
    }
    return {
        requested,
        destination: START_ROUTE,
        redirected: true,
        reason: ctx.photoSrc ? "This feature needs the photo prepared on the app server first." : "Open a photo before this feature.",
    };
}
/** A screen that uses async work must not pull focus back after another route wins. */
export class RouteRevision {
    revision = 0;
    stopped = false;
    begin() {
        if (this.stopped)
            return -1;
        return ++this.revision;
    }
    isLatest(revision) {
        return !this.stopped && revision > 0 && revision === this.revision;
    }
    stop() {
        this.stopped = true;
        this.revision++;
    }
}
