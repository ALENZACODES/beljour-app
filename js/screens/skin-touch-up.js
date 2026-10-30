import { announce, clear, h } from "../dom.js";
import { healBlemishes } from "../engines/skin/blemish.js";
import { brightenUnderEyes } from "../engines/skin/under-eye.js";
import { softenLines } from "../engines/skin/wrinkles.js";
import { localPreviewError, measuredMesh } from "./local-preview.js";
export const TOUCH_UP_BUTTONS = {
    spots: "Preview spot healing", lines: "Preview line softening", under_eye: "Preview under-eye brightening",
};
const CAPTIONS = {
    spots: "Spot healing. Natural marks kept unless you mark them.",
    lines: "Line softening. Lines are softened, not erased.",
    under_eye: "Under-eye brightening, matched to your own cheek.",
};
export const DEFAULT_TOUCH_UP_STRENGTH = 60;
/** Photo pixel under a click on the painted preview (the preview has the photo's size). */
export function previewPoint(event, box, image) {
    if (!(box.width > 0 && box.height > 0))
        return null;
    const x = (event.clientX - box.left) * image.width / box.width, y = (event.clientY - box.top) * image.height / box.height;
    return x >= 0 && y >= 0 && x < image.width && y < image.height ? [x, y] : null;
}
export function touchUpSection(ctx, dependencies) {
    const source = ctx.photoSrc, points = ctx.face?.points;
    const taps = [], keep = [];
    let revision = 0, last = null;
    const strength = h("input", { type: "range", id: "touch-up-strength", min: "0", max: "100", step: "5",
        value: String(DEFAULT_TOUCH_UP_STRENGTH) });
    const mode = h("select", { id: "touch-up-mode" }, h("option", { value: "heal" }, "Tap a spot to heal it"), h("option", { value: "keep" }, "Tap a mark to keep it"));
    const marked = h("p", { class: "fine" }, "No spots marked. Tap the spot-healing preview to mark one.");
    const status = h("p", { class: "fine", "aria-live": "polite" });
    const preview = h("div", { class: "touch-map" });
    const buttons = Object.fromEntries(Object.keys(TOUCH_UP_BUTTONS)
        .map((kind) => [kind, h("button", { class: "btn btn-quiet", type: "button" }, TOUCH_UP_BUTTONS[kind])]));
    const clearMarks = h("button", { class: "btn btn-quiet", type: "button" }, "Clear marked spots");
    const describeMarks = () => {
        marked.textContent = taps.length || keep.length
            ? `${taps.length} marked to heal, ${keep.length} marked to keep.`
            : "No spots marked. Tap the spot-healing preview to mark one.";
    };
    const render = (kind, image, mesh) => {
        const amount = Number(strength.value);
        if (kind === "spots")
            return healBlemishes(image, mesh, { strength: amount, taps, keep });
        if (kind === "lines")
            return softenLines(image, mesh, { strength: amount });
        return brightenUnderEyes(image, mesh, { strength: amount });
    };
    const run = async (kind) => {
        const own = ++revision;
        for (const b of Object.values(buttons))
            b.disabled = true;
        try {
            const image = await dependencies.read(source);
            if (own !== revision || ctx.photoSrc !== source || ctx.face?.points !== points || !preview.isConnected)
                return;
            const result = render(kind, image, measuredMesh(points, image.width, image.height));
            clear(preview);
            last = { kind, size: { width: image.width, height: image.height } };
            if (result.status === "edited") {
                preview.append(dependencies.paint(result.image, `${CAPTIONS[kind]} No treatment claim.`));
                status.textContent = "Local simulation ready. Nothing was uploaded.";
            }
            else if (kind === "spots" && result.reasonCode === "nothing_to_heal") {
                // Keep the photo on screen so she can still tap a spot to heal.
                preview.append(dependencies.paint(result.image, `${result.message} Tap a spot to heal it.`));
                status.textContent = "Your photo was not changed.";
            }
            else {
                preview.append(h("p", { class: "notice" }, result.message));
                status.textContent = "Your photo was not changed.";
            }
            announce(status.textContent);
        }
        catch (error) {
            if (own === revision && ctx.photoSrc === source) {
                clear(preview);
                preview.append(localPreviewError(error));
            }
        }
        finally {
            for (const b of Object.values(buttons))
                b.disabled = false;
        }
    };
    for (const kind of Object.keys(buttons))
        buttons[kind].addEventListener("click", () => run(kind));
    preview.addEventListener("click", (event) => {
        if (last?.kind !== "spots")
            return;
        const point = previewPoint(event, preview.getBoundingClientRect(), last.size);
        if (!point)
            return;
        (mode.value === "keep" ? keep : taps).push(point);
        describeMarks();
        return run("spots");
    });
    clearMarks.addEventListener("click", () => { taps.length = 0; keep.length = 0; describeMarks(); if (last?.kind === "spots")
        return run("spots"); });
    return h("section", {}, h("h2", {}, "Local skin touch-ups"), h("p", {}, "Moles, freckles and other natural marks are kept unless you mark them. Fine lines are softened, not erased."), h("label", { for: strength.id }, "Strength", strength), h("div", { class: "row" }, buttons.spots, buttons.lines, buttons.under_eye), h("label", { for: mode.id }, "On the spot-healing preview", mode), clearMarks, marked, status, preview, h("p", { class: "fine" }, "Local simulation of how a touch-up could look. General cosmetic information, not medical advice."));
}
//# sourceMappingURL=skin-touch-up.js.map