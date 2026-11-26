import { announce, clear, h } from "../dom.js";
import { addGrey } from "../engines/haircolour/grey-add.js";
import { depthMesh, turnPreview } from "../engines/local/turn-estimate.js";
import { FullnessRefusal, renderFullness } from "../engines/shape/fullness.js";
import { HairPainter, hairPainterSection } from "./hair-painter.js";
import { localPreviewError, measuredMesh } from "./local-preview.js";
const readout = (value, low, high) => `${value} · ${value === 0 ? "Original" : value < 0 ? low : high}`;
/** A section with a turn-on button; `open` fills it once the person turns it on. */
function optIn(cls, title, intro, button, open) {
    const section = h("section", { class: `face-parts ${cls}` }, h("h2", {}, title), h("p", {}, intro));
    // Features are simply on (owner's order, Oct 29): no "Turn on" step.
    void button;
    open(section);
    return section;
}
/** One slider, a show button and an output area that drops stale results. */
function runner(section, ctx, dependencies, spec) {
    const source = ctx.photoSrc, points = ctx.face?.points;
    const input = h("input", { type: "range", min: String(spec.min), max: "100", step: "1", value: "0", id: spec.id, "aria-label": spec.label });
    const shown = h("output", { for: spec.id }, readout(0, spec.low, spec.high));
    const output = h("div", { "aria-live": "polite" });
    let revision = 0;
    input.addEventListener("input", () => { shown.textContent = readout(Number(input.value), spec.low, spec.high); });
    input.addEventListener("change", () => { revision++; });
    const show = h("button", { class: "btn", type: "button" }, spec.show);
    show.addEventListener("click", async () => {
        const own = ++revision, amount = Number(input.value);
        const blocked = spec.ready?.() ?? null;
        if (blocked) {
            clear(output);
            output.append(h("p", { class: "notice notice-warn", role: "alert" }, blocked));
            return;
        }
        show.disabled = true;
        try {
            const image = await dependencies.read(source);
            if (own !== revision || ctx.photoSrc !== source || ctx.face?.points !== points || !output.isConnected)
                return;
            const result = spec.run(image, amount);
            clear(output);
            if ("refused" in result)
                output.append(h("p", { class: "notice notice-warn", role: "alert" }, `${result.refused} Your original is unchanged.`));
            else {
                // The original beside the after, so the change can be seen; the original is never edited.
                output.append(h("div", { class: "sim-pair" }, h("figure", {}, h("img", { src: source, alt: "Your original photo", class: "local-preview-image" }), h("figcaption", {}, "Before: your original.")), dependencies.paint(result.image, result.label)));
                if (result.note)
                    output.append(h("p", { class: "fine" }, result.note));
                announce("Local preview ready.");
            }
        }
        catch (error) {
            if (own !== revision || ctx.photoSrc !== source)
                return;
            clear(output);
            output.append(error instanceof FullnessRefusal
                ? h("p", { class: "notice notice-warn", role: "alert" }, `${error.message} Your original is unchanged.`)
                : localPreviewError(error));
        }
        finally {
            show.disabled = false;
        }
    });
    section.append(h("label", { for: spec.id }, spec.label), input, shown, h("div", { class: "row" }, show), output);
    return { input, reset: () => { input.value = "0"; shown.textContent = readout(0, spec.low, spec.high); clear(output); revision++; } };
}
function fullness(ctx, dependencies, direction) {
    return (section) => {
        const gain = direction === "gain";
        section.append(h("p", { class: "notice" }, "Face contour only, on your device. Nothing below the jaw is edited, and it does not predict how your face would change."));
        runner(section, ctx, dependencies, {
            id: `fullness-${direction}`, label: gain ? "Fuller face" : "Slimmer face", min: 0, low: "", high: gain ? "Fuller" : "Slimmer",
            show: gain ? "Show weight gain preview" : "Show weight loss preview",
            run: (image, amount) => {
                const mesh = measuredMesh(ctx.face?.points, image.width, image.height);
                const out = renderFullness(image, mesh, direction, amount, { optedIn: true });
                return { image: out.image, label: out.label, note: `Movement guard retained ${Math.round(out.guardScale * 100)}% of the requested movement.` };
            },
        });
    };
}
function turn(ctx, dependencies) {
    return (section) => {
        section.append(h("p", { class: "notice" }, "A small turn, at most 8 degrees, inside the face outline. The hidden side of the head is not made up."));
        runner(section, ctx, dependencies, {
            id: "head-turn", label: "Head turn", min: -100, low: "Toward the left of the picture", high: "Toward the right of the picture",
            show: "Show head turn preview",
            run: (image, amount) => {
                measuredMesh(ctx.face?.points, image.width, image.height);
                const { mesh, estimated } = depthMesh(ctx.face.points, image.width, image.height);
                const out = turnPreview(image, mesh, amount, estimated);
                if (out.refused)
                    return { refused: out.message };
                return { image: out.image, label: out.label, note: amount === 0 ? undefined : `Turned ${Math.abs(out.effectiveYaw).toFixed(1)} of the ${Math.abs(out.yaw).toFixed(1)} degrees asked, after the engine's guards.` };
            },
        });
    };
}
function greyAdd(ctx, dependencies) {
    return (section) => {
        let hair = null;
        const painterSlot = h("div", {});
        section.append(h("p", { class: "notice" }, "Grey is added only inside the hair you mark. Your hair is never guessed, and no age is asked or inferred."), painterSlot);
        void dependencies.read(ctx.photoSrc).then((image) => {
            if (!painterSlot.isConnected && !section.isConnected)
                return;
            painterSlot.append(hairPainterSection(image, new HairPainter(image.width, image.height), (mask) => { hair = mask; announce("Hair marking saved."); }));
        }).catch((error) => { painterSlot.append(localPreviewError(error)); });
        runner(section, ctx, dependencies, {
            id: "grey-add", label: "Grey added", min: 0, low: "", high: "More grey", show: "Show grey preview",
            ready: () => hair ? null : "Mark your hair first and choose Use these markings; it is never guessed from the photo.",
            run: (image, amount) => {
                const mesh = measuredMesh(ctx.face?.points, image.width, image.height);
                if (!hair || hair.width !== image.width || hair.height !== image.height)
                    return { refused: "Mark your hair on this photo first." };
                const out = addGrey(image, mesh, hair, amount);
                return { image: out.image, label: out.label };
            },
        });
    };
}
/** Weight gain, weight loss, head turn and grey add, in that order. */
export function moreSimulations(ctx, dependencies) {
    return [
        optIn("sim-weight-gain", "Weight gain simulation", "A fuller face contour on your own photo, from face width and cheek fullness.", "Turn on weight gain preview", fullness(ctx, dependencies, "gain")),
        optIn("sim-weight-loss", "Weight loss simulation", "Never part of any preset. A slimmer face contour on your own photo.", "Turn on weight loss preview", fullness(ctx, dependencies, "loss")),
        optIn("sim-head-turn", "Head turn", "A small turn of the head, simulated inside the face outline.", "Turn on head turn preview", turn(ctx, dependencies)),
        optIn("sim-grey-add", "Add grey", "Grey added only inside the hair you mark.", "Turn on grey preview", greyAdd(ctx, dependencies)),
    ];
}
//# sourceMappingURL=more-previews.js.map