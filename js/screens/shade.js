/** Shade: measured colours, undertone, and CIEDE2000 matches against the catalogue. */
import { api, apiBase } from "../api.js";
import { localShadeSection } from "./shade-local.js";
import { announce, clear, h } from "../dom.js";
import { costButton, errorBox, sourceNote, swatch } from "../ui/widgets.js";
import { foundationDecision } from "../salon/spec.js";
import { decisionSection } from "./decision-sheet.js";
function item(ctx, s, kind, detail) {
    return h("li", { class: "shade" }, swatch(s.hex, s.name), h("div", {}, h("strong", {}, s.name), h("p", { class: "fine" }, detail)), h("div", { class: "shade-actions" }, h("button", { class: "btn btn-small", onclick: () => { ctx.tryon = { ...ctx.tryon, [kind]: s.id }; ctx.go("tryon"); } }, "Try it on"), s.shop ? h("a", { href: s.shop, target: "_blank", rel: "noopener", class: "link" }, "Find it in store") : null));
}
function render(out, ctx, r) {
    ctx.shade = r;
    clear(out);
    const c = r.colors;
    const best = r.foundation[0];
    out.append(sourceNote(r) ?? "", h("ul", { class: "colours" }, ...[["Skin", c.skin_color], ["Lips", c.lip_color], ["Eyes", c.eye_color], ["Brows", c.eyebrow_color], ["Hair", c.hair_color]]
        .filter(([, v]) => v).map(([k, v]) => h("li", {}, swatch(v, k), h("span", {}, k), h("code", {}, v)))), h("p", {}, `Your skin reads as ${r.tone.depth} with a ${r.tone.undertone} undertone.`), best ? h("div", { class: "proof" }, h("p", { class: "big" }, best.delta_e.toFixed(1)), h("p", {}, `Colour difference (CIEDE2000) between your measured skin and the closest shade: ${best.verdict}. A typical shade in this ${r.range_stats.count} shade range is ${r.range_stats.median.toFixed(1)} away.`)) : "", h("h2", {}, "Foundation"), h("ul", { class: "shades" }, ...r.foundation.map((s) => item(ctx, s, "foundation_id", `Difference ${s.delta_e.toFixed(1)}: ${s.verdict}. ${s.undertone} undertone.`))), ...(r.lip.length ? [h("h2", {}, "Lip colour references"),
        h("ul", { class: "shades" }, ...r.lip.map((s) => item(ctx, s, "lip_id", `${s.family} family.`)))] : []), h("p", { class: "fine" }, r.note), h("p", { class: "fine" }, "These are our own colour references, not real products. They have not been tested against a store's range."));
    announce("Shade results ready.");
}
export function renderShade(main, ctx) {
    clear(main);
    if (!ctx.photoSrc && !ctx.photo) {
        ctx.go("photo");
        return;
    }
    const source = ctx.photoSrc, face = ctx.face;
    const out = h("div", { "aria-live": "polite" }), sheet = h("div", { class: "foundation-sheet" });
    main.append(h("h1", {}, "Find your shade"), h("p", { class: "lede" }, "Measure your cheeks and forehead, then compare the reading with our own foundation colour references. A colour difference is a photo estimate, not a tested product match."), localShadeSection(ctx.photoSrc, ctx.face?.points ?? null, undefined, result => {
        if (ctx.photoSrc !== source || ctx.face !== face)
            return;
        ctx.localShade = result;
        // The foundation spec sheet appears only once there is a confident local reading.
        sheet.replaceChildren(...(result && !result.refused ? [decisionSection("makeup", options => foundationDecision(result, options), { name: () => "Foundation shade", photos: false })] : []));
    }), sheet, h("p", {}, h("a", { href: "#/palettes", class: "link" }, "Mix a personal palette or extract colours from a reference photo")), apiBase() && ctx.photo ? costButton("Measure my colours", { photo_id: ctx.photo.photo_id, action: "shade" }, async () => {
        try {
            render(out, ctx, await api.shade(ctx.photo.photo_id, ctx.face?.points.map(point => [point.x, point.y, point.z ?? 0])));
        }
        catch (err) {
            clear(out);
            out.append(errorBox(err));
        }
    }) : h("p", { class: "fine" }, "The shade finder above works on this device without a server."), out);
    if (ctx.shade)
        render(out, ctx, ctx.shade);
}
//# sourceMappingURL=shade.js.map