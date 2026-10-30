/** The single consent (owner's order, 2026-10-29): asked once per device, at the first photo,
 * clip or camera open, on any page. Every surface reads appConsent.hasVisit; nothing else gates.
 * Pages with their own placement (Photo lab, Studio) show the same statement inline.
 * Author: John Khan.
 */
import { appConsent, VISIT_STATEMENTS } from "./shell/consent.js";
let pending = null;
/** Resolves true at once when consent was given before on this device; otherwise shows the one
 * statement and resolves with the person's answer. Never asks twice at the same time. */
export function ensureConsent(doc = document) {
    if (appConsent.hasVisit)
        return Promise.resolve(true);
    if (pending)
        return pending;
    // Outside a real browser (no layout engine) nobody can answer the screen: report no consent.
    if (typeof globalThis.HTMLElement === "undefined")
        return Promise.resolve(false);
    pending = new Promise((resolve) => {
        const box = doc.createElement("div");
        box.className = "one-consent one-consent-floating";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-labelledby", "one-consent-title");
        box.dataset.consentGate = "single";
        box.style.cssText = "position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:1000;max-width:min(32rem,calc(100vw - 2rem));" +
            "background:var(--blanc,#fff);color:var(--ink,#2a1a22);border:1px solid var(--line,#d9c7cf);border-radius:12px;padding:1rem 1.1rem;box-shadow:0 8px 28px rgba(0,0,0,.18);font:inherit";
        const title = doc.createElement("h2");
        title.id = "one-consent-title";
        title.textContent = "Before your first photo";
        title.style.cssText = "margin:0 0 .4rem;font-size:1.05rem";
        const text = doc.createElement("p");
        text.textContent = VISIT_STATEMENTS[0].text;
        text.style.margin = "0 0 .4rem";
        const fine = doc.createElement("p");
        fine.textContent = "Asked once on this device. You can withdraw it on the Trust page.";
        fine.style.cssText = "margin:0 0 .7rem;font-size:.85rem;opacity:.8";
        const row = doc.createElement("div");
        row.style.cssText = "display:flex;gap:.5rem;flex-wrap:wrap";
        const yes = doc.createElement("button");
        yes.type = "button";
        yes.className = "btn";
        yes.textContent = "Continue";
        const no = doc.createElement("button");
        no.type = "button";
        no.className = "btn btn-quiet";
        no.textContent = "Not now";
        row.append(yes, no);
        box.append(title, text, fine, row);
        const finish = (answer) => {
            if (answer)
                appConsent.acceptVisit({ understood: true });
            box.remove();
            pending = null;
            resolve(answer);
        };
        yes.addEventListener("click", () => finish(true));
        no.addEventListener("click", () => finish(false));
        doc.body.append(box);
        yes.focus();
    });
    return pending;
}
//# sourceMappingURL=one-consent.js.map