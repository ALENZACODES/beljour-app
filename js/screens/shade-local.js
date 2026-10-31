/** W6 on this device: the foundation shade finder runs on her photo in the browser.
 * No upload and no units. Plain copy, the result's own label ("not tested against real
 * products"), a refusal shown as a reason rather than a guess, and never a lighter
 * shade than measured. The view model is pure so it can be tested without a DOM.
 * After a match, the local Foundation step (engines/shade/foundation.ts) previews the
 * matched shade on her own skin, never lighter, at the gentle default strength.
 * Author: John Khan.
 */
import { h, clear, announce } from "../dom.js";
import { findShade } from "../engines/shade/finder.js";
import { labToSrgb, toByte } from "../engines/shade/colourspace.js";
import { foundationFromMatch, isFoundationRefusal } from "../engines/shade/foundation.js";
import { GENTLE_DEFAULT } from "../layout/effects.js";
import { localPreviewDependencies, localPreviewError, measuredMesh } from "./local-preview.js";
export function labHex(lab) {
    return "#" + labToSrgb(lab).map((v) => toByte(v).toString(16).padStart(2, "0")).join("");
}
function matchLine(m) {
    const lighter = m.lighter_by > 0 ? ` ${m.lighter_by.toFixed(1)} L* lighter than measured.` : "";
    return `Colour difference (CIEDE2000) ${m.delta_e.toFixed(1)}.${lighter}`;
}
/** What the screen shows for one finder result. */
export function localShadeView(result) {
    if (result.refused || !result.best) {
        return { heading: "No confident match", refused: true, label: result.label, swatches: [],
            lines: [`We did not pick a shade: ${result.reason ?? "the reading was not clear enough"}.`,
                "Try a photo in even daylight, facing the camera, with no filter."] };
    }
    const lines = [];
    if (result.undertone)
        lines.push(`Undertone: ${result.undertone.undertone}.`);
    if (result.depth_band !== null)
        lines.push(`Depth band ${result.depth_band} of 10 (${result.depth_band_note}).`);
    if (result.test_plan)
        lines.push(result.test_plan);
    const swatches = [result.best, result.alternative].filter((m) => m !== null)
        .map((m) => ({ name: m.name, hex: labHex(m.lab), detail: matchLine(m) }));
    return { heading: "Your closest shades", refused: false, label: result.label, lines, swatches };
}
/** Landmarks as pixel points; MediaPipe gives 0..1 fractions. */
export function pixelPoints(points, width, height) {
    const normalised = points.every((p) => p.x <= 1.5 && p.y <= 1.5);
    return points.map((p) => (normalised ? [p.x * width, p.y * height] : [p.x, p.y]));
}
export async function pixelsOf(src) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("This browser cannot read the photo's pixels.");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height, channels: 4, data };
}
function show(out, view) {
    clear(out);
    out.append(h("h2", {}, view.heading), ...view.lines.map((line) => h("p", {}, line)), h("ul", { class: "shades" }, ...view.swatches.map((s) => h("li", { class: "shade" }, h("span", { class: "swatch", style: { background: s.hex }, role: "img", "aria-label": `${s.name} ${s.hex}` }), h("div", {}, h("strong", {}, s.name), h("p", { class: "fine" }, s.detail))))), h("p", { class: "fine" }, `Local estimate. ${view.label}`));
    announce(view.refused ? "No confident shade match." : "Local shade results ready.");
}
/** Foundation in her matched shade on her own photo, on this device; runs only when she taps it. */
export function foundationSection(src, points, result, dependencies = localPreviewDependencies) {
    const strength = h("input", { type: "range", id: "foundation-strength", min: "0", max: "100", step: "5",
        value: String(GENTLE_DEFAULT) });
    const options = [result.best, result.alternative].filter((m) => m !== null);
    const choice = h("select", { id: "foundation-shade" }, ...options.map((m, i) => h("option", { value: i === 0 ? "best" : "alternative" }, m.name)));
    const status = h("p", { class: "fine", "aria-live": "polite" });
    const preview = h("div", {});
    const run = h("button", { class: "btn btn-quiet", type: "button" }, "Preview this foundation on my photo");
    run.addEventListener("click", async () => {
        run.disabled = true;
        try {
            const image = await dependencies.read(src);
            const picked = choice.value === "alternative" ? "alternative" : "best";
            const out = foundationFromMatch(image, measuredMesh(points, image.width, image.height), result, Number(strength.value), picked);
            clear(preview);
            if (isFoundationRefusal(out)) {
                preview.append(h("p", { class: "notice" }, out.message));
                status.textContent = "Your photo was not changed.";
            }
            else if (out.metrics.unchanged) {
                preview.append(h("p", { class: "notice" }, "Strength is zero, so the photo is unchanged."));
                status.textContent = "Your photo was not changed.";
            }
            else {
                const name = (picked === "alternative" ? result.alternative : result.best).name;
                preview.append(dependencies.paint({ ...image, data: out.image }, `Foundation in ${name}. ${out.label}`));
                status.textContent = "Local simulation ready. Nothing was uploaded.";
            }
            announce(status.textContent);
        }
        catch (error) {
            clear(preview);
            preview.append(localPreviewError(error));
        }
        finally {
            run.disabled = false;
        }
    });
    return h("section", { class: "local-foundation" }, h("h3", {}, "See it on your skin"), h("p", { class: "fine" }, "Your matched shade on your own photo. It can deepen or even out your skin, never lighten it. Freckles and moles stay."), h("label", { for: choice.id }, "Shade", choice), h("label", { for: strength.id }, "Coverage", strength), run, status, preview);
}
/** A section for the Shade screen; runs only when she taps it. */
export function localShadeSection(src, points, readPixels = pixelsOf, onResult, preview = localPreviewDependencies) {
    const out = h("div", { "aria-live": "polite" });
    const run = h("button", { class: "btn", type: "button" }, "Find my shade on this device");
    run.addEventListener("click", async () => {
        clear(out);
        onResult?.(null);
        if (!src || !points || points.length < 478) {
            out.append(h("p", {}, "Add a photo with a face first, so the finder can read your cheeks and forehead."));
            return;
        }
        try {
            const photo = await readPixels(src);
            const result = findShade(photo, pixelPoints(points, photo.width, photo.height));
            onResult?.(result.refused ? null : result);
            show(out, localShadeView(result));
            if (!result.refused && result.best && points.length === 478)
                out.append(foundationSection(src, points, result, preview));
        }
        catch (err) {
            out.append(h("p", {}, err instanceof Error ? err.message : "The shade finder could not read this photo."));
        }
    });
    return h("section", { class: "local-shade" }, h("h2", {}, "Shade finder on this device"), h("p", { class: "fine" }, "Measured from your cheeks and forehead in the browser. Nothing is uploaded and no units are used."), h("p", { class: "fine" }, "Local estimate. Not tested against real products. We never choose a lighter shade than measured."), run, out);
}
