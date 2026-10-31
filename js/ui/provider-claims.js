/** Provider wording that matches this build. A page's YouCam lines (footer, meta description,
 * featured copy) ship in their on-device wording, which is true of the static build, where
 * window.BELJOUR_API is empty (config.js). Only when a server is configured (apiBase(), the same
 * check every API call makes) and on-device mode is off does each [data-provider-live] element
 * switch to its YouCam wording. So the page never says results come from YouCam while the build
 * cannot reach YouCam.
 * Author: John Khan.
 */
import { apiBase } from "../api.js";
import { LOCAL_ONLY_KEY } from "./shell/consent.js";
/** True when this page can actually reach the YouCam proxy. */
export function providerLive(store = safeStore()) {
    if (apiBase() === null)
        return false;
    try {
        return store?.getItem(LOCAL_ONLY_KEY) !== "1";
    }
    catch {
        return true;
    }
}
function safeStore() {
    try {
        return globalThis.localStorage ?? null;
    }
    catch {
        return null;
    }
}
/** Swap every marked claim to its live wording when a server is configured; otherwise leave the
 * shipped on-device wording. Returns how many claims were switched. */
export function applyProviderClaims(doc = document, live = providerLive()) {
    if (!live)
        return 0;
    let n = 0;
    for (const el of Array.from(doc.querySelectorAll("[data-provider-live]"))) {
        const text = el.dataset.providerLive ?? "";
        if (!text)
            continue;
        if (el.tagName === "META")
            el.setAttribute("content", text);
        else
            el.textContent = text;
        n++;
    }
    return n;
}
if (typeof document !== "undefined")
    applyProviderClaims();
