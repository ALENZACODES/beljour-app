"use strict";
/** Page guard: the last line of defence on every page. A plain (non-module) script, loaded in
 * each built page's <head> before the page's own code (web/scripts/add-page-guard.mjs adds the
 * tag at build time), so it is listening even when a page's module fails to load or throws while
 * starting. On an uncaught error or unhandled rejection it logs to this browser's console and
 * shows a calm "Something went wrong" banner with a Reload button instead of leaving a dead page.
 * Nothing is sent anywhere: no network call, no storage, and the error text is never shown on
 * the page. Pages with their own error notice (the classic app's .lg-client-error) keep theirs;
 * the guard then only logs. Author: John Khan.
 */
(() => {
    const scope = window;
    if (scope.BELJOUR_PAGE_GUARD)
        return;
    const state = { installed: true, count: 0, shown: false };
    scope.BELJOUR_PAGE_GUARD = state;
    const TITLE = "Something went wrong";
    const TEXT = "This page hit a problem. Your photos stay on this device. Reload to try again.";
    /** Browser noise that is not a failure of the page: layout observers that skipped a frame, and
     * work the page cancelled on purpose. */
    function ignorable(message, name) {
        return /^ResizeObserver loop/.test(message) || name === "AbortError";
    }
    function banner() {
        if (state.shown)
            return;
        // The classic app (index.html) has its own error notice; two banners would be noise.
        if (document.querySelector(".lg-client-error"))
            return;
        state.shown = true;
        const box = document.createElement("div");
        box.className = "bj-page-guard";
        box.setAttribute("role", "alert");
        box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;max-width:560px;margin:0 auto;"
            + "padding:14px 16px;border-radius:12px;border:1px solid rgba(127,127,127,.35);background:Canvas;color:CanvasText;"
            + "box-shadow:0 6px 24px rgba(0,0,0,.18);font:15px/1.4 system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center";
        const words = document.createElement("p");
        words.style.cssText = "margin:0;flex:1 1 260px";
        const strong = document.createElement("strong");
        strong.textContent = `${TITLE}. `;
        words.append(strong, TEXT);
        const reload = document.createElement("button");
        reload.type = "button";
        reload.textContent = "Reload";
        reload.style.cssText = "font:inherit;padding:6px 14px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer";
        reload.addEventListener("click", () => location.reload());
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "Dismiss";
        close.style.cssText = "font:inherit;padding:6px 10px;border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer";
        close.addEventListener("click", () => box.remove());
        box.append(words, reload, close);
        (document.body ?? document.documentElement).append(box);
    }
    function report(kind, detail) {
        state.count++;
        try {
            console.error(`BELJOUR page guard: ${kind}.`, detail);
        }
        catch { /* the console itself may be gone */ }
        if (document.readyState === "loading")
            document.addEventListener("DOMContentLoaded", banner, { once: true });
        else
            banner();
    }
    window.addEventListener("error", (event) => {
        // A script that failed to load fires a non-bubbling error at its element; capture sees it.
        const target = event.target;
        if (target && target !== window && "tagName" in target) {
            if (target.tagName === "SCRIPT")
                report("a script could not load", target.src);
            return; // images, media and stylesheets have their own fallbacks
        }
        const e = event;
        const error = e.error;
        if (ignorable(String(e.message ?? ""), typeof error?.name === "string" ? error.name : ""))
            return;
        report("uncaught error", e.error ?? e.message);
    }, true);
    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        if (ignorable(String(reason?.message ?? ""), typeof reason?.name === "string" ? reason.name : ""))
            return;
        report("unhandled promise rejection", event.reason);
    });
})();
//# sourceMappingURL=page-guard.js.map