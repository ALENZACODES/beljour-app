/** Home hash route for opt-in keyboard and device review. */
import { mountAccessibilityPage } from "./accessibility-page.js";
export function mountAccessibilityEntry(doc = document, browser = window) {
    const host = doc.getElementById("lg-accessibility-root");
    if (!host)
        return { active: () => false, destroy: () => undefined };
    const container = host;
    let page = null;
    let disposed = false;
    function close() {
        page?.close();
        page = null;
        container.hidden = true;
        delete doc.body.dataset.accessibilityActive;
    }
    function sync() {
        if (disposed)
            return;
        if (browser.location.hash !== "#accessibility") {
            close();
            return;
        }
        if (page)
            return;
        container.hidden = false;
        doc.body.dataset.accessibilityActive = "true";
        page = mountAccessibilityPage(doc, container, browser);
    }
    const onHash = () => sync();
    const onHide = () => close();
    browser.addEventListener("hashchange", onHash);
    browser.addEventListener("pagehide", onHide);
    sync();
    return {
        active: () => page !== null,
        destroy() {
            if (disposed)
                return;
            disposed = true;
            browser.removeEventListener("hashchange", onHash);
            browser.removeEventListener("pagehide", onHide);
            close();
        },
    };
}
