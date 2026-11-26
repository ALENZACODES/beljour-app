/** Small controls for the Create panel: buttons, a labelled slider, a choice group and the theme
 * colour swatches with the eyedropper. Native elements with visible labels and 44 px targets
 * (create.css). Author: John Khan.
 */
import { h } from "../../dom.js";
import { PALETTE, PHOTO_MARK } from "../../ui/palette.js";
/** The colours offered: the theme palette (plus its amber mark colour), named for screen readers. */
export const SWATCHES = [
    { name: "Plum", hex: PALETTE.plum }, { name: "Deep plum", hex: PALETTE.plumDeep }, { name: "Blush", hex: PALETTE.blush },
    { name: "Cream", hex: PALETTE.cream }, { name: "Paper white", hex: PALETTE.surface }, { name: "Wine", hex: PALETTE.wine },
    { name: "Ink", hex: PALETTE.ink }, { name: "Mauve grey", hex: PALETTE.muted }, { name: "Amber", hex: PHOTO_MARK.second },
];
export function btn(label, act, opts = {}) {
    const b = h("button", { type: "button", class: opts.cls ?? "cr-btn", title: opts.title }, label);
    if (opts.pressed !== undefined)
        b.setAttribute("aria-pressed", String(opts.pressed));
    if (opts.disabled)
        b.disabled = true;
    b.addEventListener("click", act);
    return b;
}
/** A labelled range. `live` runs while dragging (preview only), `done` once on release (one undo step). */
export function slider(label, value, min, max, step, live, done, show = (v) => String(Math.round(v))) {
    const input = h("input", { type: "range", min: String(min), max: String(max), step: String(step), class: "cr-range" });
    input.value = String(value);
    input.setAttribute("aria-label", label);
    const out = h("output", { class: "cr-out" }, show(value));
    input.addEventListener("input", () => { const v = Number(input.value); out.textContent = show(v); live(v); });
    input.addEventListener("change", () => done(Number(input.value)));
    return h("label", { class: "cr-field" }, h("span", { class: "cr-name" }, label), input, out);
}
/** A row of buttons acting as one choice; the chosen one is pressed. */
export function choices(label, items, current, pick) {
    const row = h("div", { class: "cr-choices", role: "group", "aria-label": label });
    for (const item of items)
        row.append(btn(item.label, () => pick(item.id), { pressed: item.id === current, title: item.title }));
    return h("div", { class: "cr-group" }, h("span", { class: "cr-name" }, label), row);
}
/** Theme colour swatches and a "pick from the picture" button. */
export function swatches(label, current, pick, eyedrop) {
    const row = h("div", { class: "cr-swatches", role: "group", "aria-label": label });
    for (const s of SWATCHES) {
        const b = btn("", () => pick(s.hex), { pressed: s.hex.toUpperCase() === current.toUpperCase(), title: s.name, cls: "cr-swatch" });
        b.setAttribute("aria-label", `${label}: ${s.name}`);
        b.style.background = s.hex;
        row.append(b);
    }
    if (eyedrop)
        row.append(btn("Pick from picture", eyedrop, { title: "Tap the picture to take its colour", cls: "cr-btn cr-eyedrop" }));
    return h("div", { class: "cr-group" }, h("span", { class: "cr-name" }, label), row);
}
export function section(title, ...children) {
    const s = h("section", { class: "cr-section" }, h("h4", {}, title));
    for (const c of children)
        if (c)
            s.append(c);
    return s;
}
/** `#RRGGBB` for a sampled pixel. */
export function hexOf(r, g, b) {
    return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
//# sourceMappingURL=kit.js.map