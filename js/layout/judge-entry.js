/** Opt-in Home hash route. Existing tools and classic navigation remain unchanged. */
import { mountJudgeMode } from "./judge-mode.js";
import { mountContinuousDemo } from "./continuous/mount.js";
import { mountReleaseWorkspace } from "./release/mount.js";
export function mountJudgeEntry(doc = document, browser = window) {
    const target = doc.getElementById("lg-judge-root");
    if (!target)
        return { active: () => false, destroy: () => undefined };
    let mode = null;
    let activeRoute = null;
    let destroyed = false;
    const host = target;
    function close() {
        mode?.dispose();
        mode = null;
        activeRoute = null;
        host.hidden = true;
        delete doc.body.dataset.judgeActive;
    }
    function sync() {
        if (destroyed)
            return;
        const route = browser.location.hash === "#judge-full" ? "full"
            : browser.location.hash === "#judge" ? "judge"
                : browser.location.hash === "#judge-verify" ? "verify" : null;
        if (!route) {
            close();
            return;
        }
        if (mode && activeRoute === route)
            return;
        close();
        host.hidden = false;
        doc.body.dataset.judgeActive = "true";
        activeRoute = route;
        const exit = () => {
            const destination = activeRoute === "verify" ? "lg-verify-launch" : "lg-judge-launch";
            close();
            browser.location.hash = "#home";
            doc.getElementById(destination)?.focus();
        };
        mode = route === "verify" ? mountReleaseWorkspace(doc, host, exit)
            : route === "full" ? mountContinuousDemo(doc, host, exit)
                : mountJudgeMode(doc, host, exit);
    }
    const onHash = () => sync();
    const onHide = () => close();
    const onShow = (event) => {
        if (event.persisted)
            sync();
    };
    browser.addEventListener("hashchange", onHash);
    browser.addEventListener("pagehide", onHide);
    browser.addEventListener("pageshow", onShow);
    sync();
    return {
        active: () => mode !== null,
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            browser.removeEventListener("hashchange", onHash);
            browser.removeEventListener("pagehide", onHide);
            browser.removeEventListener("pageshow", onShow);
            close();
        },
    };
}
//# sourceMappingURL=judge-entry.js.map