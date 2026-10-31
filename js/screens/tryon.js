/** Try on: makeup-vto with the matched shades, before/after slider and honesty meter. */
import { applyStyling } from "../ui/styling-tasks.js";
import { announce, clear, h } from "../dom.js";
import { compare, costButton, errorBox, sourceNote, swatch } from "../ui/widgets.js";
import { sendConsentBox } from "../ui/send-consent.js";
import { appConsent } from "../ui/shell/consent.js";
import { YOUCAM_PRODUCTS, YOUCAM_NOTICE } from "../ui/provider-labels.js";
const BLUSH = [
    { id: "B01", name: "Sample Blush Apricot", hex: "#E8906E" }, { id: "B02", name: "Sample Blush Rose", hex: "#D8798A" },
    { id: "B03", name: "Sample Blush Berry", hex: "#B0506A" }, { id: "B04", name: "Sample Blush Terracotta", hex: "#B8664C" },
];
function group(ctx, legend, key, items, onChange) {
    const name = `pick-${key}`;
    const opt = (id, label, hex) => {
        const input = h("input", { type: "radio", name, value: id, id: `${name}-${id || "none"}`, checked: (ctx.tryon[key] ?? "") === id });
        input.addEventListener("change", () => { ctx.tryon = { ...ctx.tryon, [key]: id || undefined }; onChange(); });
        return h("label", { class: "pick", for: input.id }, input, hex ? swatch(hex, label) : null, h("span", {}, label));
    };
    return h("fieldset", { class: "picks" }, h("legend", {}, legend), opt("", "None"), ...items.map((s) => opt(s.id, s.name, s.hex)));
}
export function renderTryon(main, ctx) {
    clear(main);
    if (!ctx.photoSrc) {
        ctx.go("photo");
        return;
    }
    if (!ctx.photo) {
        renderLocalTryon(main);
        return;
    }
    main.append(h("h1", {}, "Try it on"), h("p", { class: "fine" }, YOUCAM_PRODUCTS.makeup), h("p", { class: "fine" }, YOUCAM_NOTICE));
    if (!ctx.shade) {
        main.append(h("p", { class: "lede" }, "First measure your colours, so the try on starts from shades that match you."), h("button", { class: "btn", onclick: () => ctx.go("shade") }, "Measure my colours"));
        return;
    }
    const out = h("div", { "aria-live": "polite" });
    const action = h("div", {});
    const refresh = () => {
        clear(action);
        const body = { photo_id: ctx.photo.photo_id, ...ctx.tryon };
        if (!ctx.tryon.foundation_id && !ctx.tryon.lip_id && !ctx.tryon.blush_id) {
            action.append(h("p", { class: "hint" }, "Pick at least one product."));
            return;
        }
        const show = costButton("Show me", { ...body, action: "makeup" }, async () => {
            try {
                const r = await applyStyling({ ...body, action: "makeup" });
                clear(out);
                out.append(compare(ctx.photoSrc, r.image, "with the chosen makeup"), sourceNote(r) ?? "");
                const picked = [...ctx.shade.foundation, ...ctx.shade.lip].filter((s) => s.id === body.foundation_id || s.id === body.lip_id);
                const links = picked.filter((s) => s.shop);
                if (links.length)
                    out.append(h("p", {}, "Like it? ", ...links.map((s) => h("a", { href: s.shop, target: "_blank", rel: "noopener", class: "link" }, `Find ${s.name}`))));
                announce("Try on ready.");
            }
            catch (err) {
                clear(out);
                out.append(errorBox(err));
            }
        });
        const cleared = () => appConsent.allows(body.photo_id, "makeup");
        show.dataset.consent = String(cleared());
        action.append(sendConsentBox(() => [body.photo_id], "makeup", (allowed) => { show.dataset.consent = String(allowed); }), show);
    };
    main.append(h("p", { class: "lede" }, "Your closest matches are listed first. The quote shows units before you apply. Saved repeats use zero units."), group(ctx, "Foundation", "foundation_id", ctx.shade.foundation, refresh), group(ctx, "Lips", "lip_id", ctx.shade.lip, refresh), group(ctx, "Blush", "blush_id", BLUSH, refresh), action, out);
    refresh();
}
/** The photo is open on this device only (no app server, or not prepared on it). Makeup try-on is
 * a YouCam result, so it is not offered here and nothing is sent; the Studio's on-device makeup
 * looks and the Shade step work on this same photo. */
function renderLocalTryon(main) {
    main.append(h("h1", {}, "Try it on"), h("p", { class: "fine" }, YOUCAM_PRODUCTS.makeup), h("p", { class: "hint", role: "status", "aria-live": "polite" }, "Your photo is open on this device only, so the YouCam makeup try-on is off here and nothing is sent. No units are used."), h("p", { class: "lede" }, "Makeup looks made on your device are in the Studio, and the Shade step measures your colours on this photo."), h("div", { class: "row" }, h("a", { href: "studio.html#studio=makeup", class: "btn" }, "Open makeup looks in the Studio"), h("a", { href: "#/shade", class: "btn btn-quiet" }, "Measure my colours")));
}
