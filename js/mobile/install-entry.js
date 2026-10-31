/** Installs a passive browser prompt listener, never a service worker until clicked. */
import { createInstallController, installationBrowserPort } from "./install-controller.js";
import { mountInstallPage } from "./install-page.js";
export function mountInstallEntry(doc = document, browser = window) {
    const host = doc.getElementById("lg-install-root");
    if (!host)
        return { active: () => false, destroy: () => undefined };
    const container = host;
    const controller = createInstallController(installationBrowserPort(browser));
    let page = null;
    let disposed = false;
    function close() {
        page?.destroy();
        page = null;
        container.hidden = true;
        delete doc.body.dataset.installActive;
    }
    function sync() {
        if (disposed)
            return;
        if (browser.location.hash !== "#install") {
            close();
            return;
        }
        if (page)
            return;
        container.hidden = false;
        doc.body.dataset.installActive = "true";
        page = mountInstallPage(doc, container, controller);
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
            controller.dispose();
        },
    };
}
