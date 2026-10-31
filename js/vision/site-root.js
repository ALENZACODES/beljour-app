/** Site root for same-origin assets, so the app also works under a sub-path such as
 * /beljour-app/ on GitHub Pages. Pages live at the root; workers live under /js/. */
export function siteRoot() {
    const href = String(globalThis.location?.href ?? "/");
    const at = href.indexOf("/js/");
    if (at >= 0)
        return href.slice(0, at + 1);
    try {
        return new URL("./", href).href;
    }
    catch {
        return "/";
    }
}
