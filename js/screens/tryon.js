import { announce, clear, h } from "../dom.js";
import { toRGBA } from "../engines/core/buffer.js";
import { BLUSHES, drawLook, foundationChoices, LIPS } from "../engines/makeup-local/index.js";
import { labHex, pixelPoints, pixelsOf } from "./shade-local.js";
import { compare, errorBox, swatch } from "../ui/widgets.js";
function group(ctx, legend, key, items, onChange) {
    const name = `pick-${key}`;
    const opt = (id, label, hex, note) => {
        const input = h("input", { type: "radio", name, value: id, id: `${name}-${id || "none"}`, checked: (ctx.tryon[key] ?? "") === id });
        input.addEventListener("change", () => { ctx.tryon = { ...ctx.tryon, [key]: id || undefined }; onChange(); });
        return h("label", { class: "pick", for: input.id }, input, hex ? swatch(hex, label) : null, h("span", {}, label), note ? h("small", { class: "fine" }, ` ${note}`) : null);
    };
    return h("fieldset", { class: "picks" }, h("legend", {}, legend), opt("", "None"), ...items.map((s) => opt(s.id, s.name, s.hex, s.note)));
}
function dataUrl(img) {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").putImageData(new ImageData(toRGBA(img), img.width, img.height), 0, 0);
    return c.toDataURL("image/jpeg", 0.92);
}
export function renderTryon(main, ctx) {
    clear(main);
    if (!ctx.photoSrc) {
        ctx.go("photo");
        return;
    }
    main.append(h("h1", {}, "Try it on"), h("p", { class: "fine" }, "Drawn on this device with our own sample colours. Your photo never leaves it."));
    if (!ctx.face || !ctx.photoSrc) {
        main.append(h("p", { class: "lede" }, "No face was read in this photo, so there is nowhere to draw the makeup. Try a clear, front-facing photo."), h("button", { class: "btn", onclick: () => ctx.go("photo") }, "Choose another photo"));
        return;
    }
    const status = h("p", { class: "hint", role: "status" }, "Reading your skin colour on this device…");
    const out = h("div", { "aria-live": "polite" });
    const picks = h("div", {});
    main.append(status, picks, out);
    void (async () => {
        let image, points;
        try {
            image = await pixelsOf(ctx.photoSrc);
            points = pixelPoints(ctx.face.points, image.width, image.height);
        }
        catch (err) {
            clear(out);
            out.append(errorBox(err));
            return;
        }
        const found = foundationChoices(image, points);
        const shades = "shades" in found ? found.shades : [];
        const measured = "measured" in found ? found.measured : null;
        status.textContent = measured
            ? `Your skin reads ${labHex(measured)}. Foundations are the closest of our reference shades, never lighter.`
                + ("estimate" in found && found.estimate ? " The light on this photo is uneven, so this is an estimate: check the shade on your jaw in daylight." : "")
            : `Foundation is off for this photo: ${"refused" in found ? found.refused : ""} Lip colour and blush still work.`;
        const foundations = shades.map((s) => ({ id: s.id, name: s.name, hex: labHex(s.lab), note: `ΔE ${s.delta_e.toFixed(1)}` }));
        const draw = () => {
            clear(out);
            const choice = {
                foundation: shades.find((s) => s.id === ctx.tryon.foundation_id) ?? null,
                lip: LIPS.find((c) => c.id === ctx.tryon.lip_id) ?? null,
                blush: BLUSHES.find((c) => c.id === ctx.tryon.blush_id) ?? null,
            };
            if (!choice.foundation && !choice.lip && !choice.blush) {
                out.append(h("p", { class: "hint" }, "Pick at least one product."));
                return;
            }
            try {
                const after = drawLook(image, points, measured ?? [60, 12, 16], choice);
                out.append(compare(ctx.photoSrc, dataUrl(after), "with the chosen makeup"), h("p", { class: "fine" }, "Drawn on this device. Skin is never lightened; our own sample colours, not real products."));
                announce("Try on ready.");
            }
            catch (err) {
                out.append(errorBox(err));
            }
        };
        picks.append(foundations.length ? group(ctx, "Foundation", "foundation_id", foundations, draw) : h("p", { class: "fine" }, "No foundation this time."), group(ctx, "Lips", "lip_id", LIPS, draw), group(ctx, "Blush", "blush_id", BLUSHES, draw));
        draw();
    })();
}
//# sourceMappingURL=tryon.js.map