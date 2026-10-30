/** Reusable pieces: score ruler, before/after slider, cost button, notices. */
import { quoteDisplay } from "./quote-display.js";
import { api, ApiError } from "../api.js";
import { announce, h } from "../dom.js";
import { badgeModel, provenanceOf } from "./provenance.js";
/** A 0..100 ruler. Solid tick: YouCam's measured score. Hollow tick: its friendlier display score. */
export function ruler(raw, ui, label) {
    const wrap = h("div", { class: "ruler", role: "img",
        "aria-label": `${label}: measured ${raw} out of 100, display score ${ui}` });
    wrap.append(h("span", { class: "ruler-track" }), h("span", { class: "ruler-gap", style: { left: `${Math.min(raw, ui)}%`, width: `${Math.abs(ui - raw)}%` } }), h("span", { class: "ruler-tick ruler-raw", style: { left: `${raw}%` } }), h("span", { class: "ruler-tick ruler-ui", style: { left: `${ui}%` } }));
    return wrap;
}
/** Before/after comparison. The handle is a real range input, so it works with keys and screen readers. */
export function compare(before, after, alt) {
    const afterImg = h("img", { src: after, alt: `After: ${alt}`, class: "cmp-after" });
    const clip = h("div", { class: "cmp-clip" }, h("img", { src: before, alt: "Before", class: "cmp-before" }));
    const line = h("div", { class: "cmp-line", "aria-hidden": "true" });
    const range = h("input", { type: "range", min: "0", max: "100", value: "50", class: "cmp-range",
        "aria-label": "Slide to compare before and after" });
    const set = (v) => {
        clip.style.width = `${v}%`;
        line.style.left = `${v}%`;
    };
    range.addEventListener("input", () => set(Number(range.value)));
    set(50);
    return h("figure", { class: "cmp" }, h("div", { class: "cmp-stage" }, afterImg, clip, line, range), h("figcaption", {}, h("span", {}, "Before"), h("span", {}, "After")));
}
export function honestyMeter(hm) {
    return h("p", { class: "honesty" }, h("strong", {}, `${hm.changed_percent}% of pixels changed`), " by this edit. The rest of your photo is untouched.");
}
/** The provenance badge: Live / Recorded API example / Local simulation, or Sample. */
export function provenanceBadge(meta) {
    const m = badgeModel(provenanceOf(meta));
    return h("p", { class: "provenance", "aria-label": m.aria }, h("span", { class: `badge badge-${m.tone}` }, m.label), m.detail ? h("span", { class: "badge-detail" }, ` ${m.detail}`) : null, m.simulation ? h("span", { class: "badge-sim" }, ` ${m.simulation}`) : null);
}
export function sourceNote(meta) {
    if (meta.synthetic) {
        return h("div", {}, provenanceBadge(meta), h("p", { class: "notice notice-warn" }, "Sample numbers made up for the demo, not a real analysis. Run the recorder with a real photo to replace them."));
    }
    const text = {
        live: `Fresh result from YouCam. Used ${meta.units_spent} unit${meta.units_spent === 1 ? "" : "s"}.`,
        cache: "Same photo and settings as before, so this came from the cache at no cost.",
        demo: "Saved demo result. No units used.",
        local: "Made on our server without YouCam. No units used.",
    };
    return h("div", {}, provenanceBadge(meta), h("p", { class: "source" }, text[meta.source] ?? ""));
}
export function errorBox(err) {
    let message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds !== null) {
        const seconds = Math.ceil(err.retryAfterSeconds);
        message += ` Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
    }
    announce(message);
    return h("p", { class: "notice notice-error", role: "alert" }, message);
}
/**
 * A button that shows its unit price before running. Asks the server, which knows
 * whether the same request is already cached.
 */
export function costButton(label, quoteBody, onRun) {
    const price = h("span", { class: "price" }, quoteBody ? "checking price" : "free");
    const btn = h("button", { class: "btn" }, h("span", {}, label), price);
    if (quoteBody) {
        api.quote(quoteBody).then((q) => {
            const description = quoteDisplay(q);
            price.textContent = description.text;
            btn.title = description.detail;
            btn.setAttribute("data-flow", description.scope);
            btn.disabled = !description.available;
        }).catch(() => {
            price.textContent = "quote unavailable";
            btn.title = "Can't verify the server price or visit allowance";
            btn.disabled = true;
        });
    }
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        try {
            await onRun();
        }
        finally {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
        }
    });
    return btn;
}
export function swatch(hex, label) {
    return h("span", { class: "swatch", style: { background: hex }, role: "img", "aria-label": `${label} ${hex}` });
}
/** A real button that opens a file picker, so it works with the keyboard. */
export function filePicker(label, accept, onFile, quiet = true) {
    const input = h("input", { type: "file", accept, class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" });
    input.addEventListener("change", () => {
        const f = input.files?.[0];
        if (f)
            onFile(f);
        input.value = "";
    });
    return h("span", {}, h("button", { class: quiet ? "btn btn-quiet" : "btn", onclick: () => input.click() }, label), input);
}
export function spark(values, label) {
    if (values.length < 2)
        return null;
    const width = 160, height = 36;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const points = values.map((v, i) => `${Math.round((i / (values.length - 1)) * width)},${Math.round(height - 3 - ((v - min) / span) * (height - 6))}`).join(" ");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "spark");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${label}: ${values.join(", ")}`);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", points);
    svg.append(line);
    return svg;
}
//# sourceMappingURL=widgets.js.map