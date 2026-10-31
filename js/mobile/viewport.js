/** A small capability wrapper for the disclosure navigation on narrow screens.
 * CSS owns layout and the phone breakpoints. The watcher owns focus cleanup only.
 */
export const COMPACT_QUERY = "(max-width: 760px)";
export const COMPACT_MAX = 760;
export const SMALL_PHONE_MAX = 480;
export function widthClass(width) {
    if (!Number.isFinite(width) || width <= 0)
        throw new RangeError("Width must be positive");
    if (width <= SMALL_PHONE_MAX)
        return "phone";
    if (width <= COMPACT_MAX)
        return "compact";
    return "wide";
}
/** An unavailable matchMedia implementation is not an excuse to hide navigation. */
export function compactNow(host) {
    if (typeof host.matchMedia === "function") {
        try {
            return host.matchMedia(COMPACT_QUERY).matches;
        }
        catch {
            return false;
        }
    }
    const width = host.innerWidth;
    return typeof width === "number" && Number.isFinite(width) && width > 0
        ? width <= COMPACT_MAX
        : false;
}
export function watchCompact(host, change) {
    let query = null;
    try {
        query = host.matchMedia?.(COMPACT_QUERY) ?? null;
    }
    catch {
        change(false);
        return () => undefined;
    }
    if (!query) {
        change(compactNow(host));
        return () => undefined;
    }
    const listener = (event) => change(event.matches);
    change(query.matches);
    if (query.addEventListener) {
        query.addEventListener("change", listener);
        return () => query?.removeEventListener?.("change", listener);
    }
    if (query.addListener) {
        query.addListener(listener);
        return () => query?.removeListener?.(listener);
    }
    return () => undefined;
}
/** Keep a full-size, native control rather than relying on gesture recognition. */
export function touchTargetSize(width) {
    return widthClass(width) === "wide" ? 40 : 44;
}
