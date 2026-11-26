/** Progressive navigation and status UI on the four existing application pages.
 * Does not own an editor, a photo, session state or a feature implementation.
 */
import { clientPage } from "./client-routes.js";
import { mountClientNavigation } from "../ui/shell/client-navigation.js";
import { mountConnectionNotice } from "../ui/shell/connectivity.js";
import { mountErrorNotice } from "../ui/shell/client-errors.js";
function emptyClientShell() {
    return {
        navigation: null,
        connection: null,
        errors: null,
        update: () => undefined,
        destroy: () => undefined,
    };
}
/** Injects only within a dedicated page-owned node. Does not modify the page's landmarks. */
export function mountClientShell(doc = document, browser = window, options = {}) {
    const target = doc.getElementById("lg-client-root");
    if (!target)
        return emptyClientShell();
    if (target.dataset.clientMounted === "true")
        return emptyClientShell();
    const mountNode = target;
    target.dataset.clientMounted = "true";
    const page = options.page ?? clientPage(doc.body.dataset.page);
    const navigation = mountClientNavigation(doc, browser, page, browser.location?.hash ?? "");
    const connection = mountConnectionNotice(doc, browser, options.health);
    const errors = mountErrorNotice(doc, browser, options.retryView);
    target.append(navigation.element, connection.element, errors.element);
    let disposed = false;
    const onHashChange = () => {
        if (!disposed)
            navigation.update(page, browser.location?.hash ?? "");
    };
    browser.addEventListener("hashchange", onHashChange);
    const onPageHide = () => destroy();
    browser.addEventListener("pagehide", onPageHide, { once: true });
    function destroy() {
        if (disposed)
            return;
        disposed = true;
        browser.removeEventListener("hashchange", onHashChange);
        browser.removeEventListener("pagehide", onPageHide);
        navigation.destroy();
        connection.destroy();
        errors.destroy();
        delete mountNode.dataset.clientMounted;
    }
    return {
        navigation,
        connection,
        errors,
        update(nextPage, hash, readiness = null) {
            if (disposed)
                return;
            navigation.update(nextPage, hash, readiness);
        },
        destroy,
    };
}
//# sourceMappingURL=client-shell.js.map