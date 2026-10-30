/** Distinct Home hash route so timing needs no copied HTML or shared build edit. */
import { mountTimingPage } from "./timing-page.js";
export function mountTimingEntry(doc = document, browser = window) {
    const host = doc.getElementById("lg-timing-root");
    if (!host)
        return { active: () => false, destroy: () => undefined };
    let page = null;
    let destroyed = false;
    const container = host;
    function close() {
        page?.close();
        page = null;
        container.hidden = true;
        delete doc.body.dataset.timingActive;
    }
    function sync() {
        if (destroyed)
            return;
        if (browser.location.hash !== "#timing") {
            close();
            return;
        }
        if (page)
            return;
        container.hidden = false;
        doc.body.dataset.timingActive = "true";
        page = mountTimingPage(doc, container, browser);
    }
    const onChange = () => sync();
    const onHide = () => close();
    browser.addEventListener("hashchange", onChange);
    browser.addEventListener("pagehide", onHide);
    sync();
    return {
        active: () => page !== null,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            browser.removeEventListener("hashchange", onChange);
            browser.removeEventListener("pagehide", onHide);
            close();
        },
    };
}
//# sourceMappingURL=timing-entry.js.map