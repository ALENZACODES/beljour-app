import { announce, clear, h } from "../dom.js";
import { CONTROLS, renderShape } from "../engines/shape/geometry.js";
import { facePartsSection } from "./face-parts.js";
import { controlIcon } from "./shape-art.js";
import { expressionsSection } from "./expressions.js";
import { moreSimulations } from "./more-previews.js";
import { localPreviewDependencies, localPreviewError, measuredMesh, needsLocalPhoto } from "./local-preview.js";
export async function renderPreviews(main, ctx, dependencies = localPreviewDependencies) {
    clear(main);
    if (needsLocalPhoto(ctx))
        return;
    const source = ctx.photoSrc;
    const originalPoints = ctx.face?.points;
    const values = {};
    const history = [];
    let revision = 0;
    const output = h("div", { "aria-live": "polite" });
    const controls = h("div", { class: "proc-grid" });
    const inputs = new Map();
    main.append(h("h1", {}, "Face shape previews"), h("p", { class: "lede" }, "Local simulation. Try one change at a time, using the measured points on your own photo."), h("p", { class: "notice" }, "This changes photo geometry on your device. It does not predict a treatment result. Your original stays untouched."), ...(ctx.localPhoto?.example ? [h("p", { class: "fine" }, `${ctx.localPhoto.example.label}: AI-generated, not a real person. The after below is made by this app's own engines.${ctx.localPhoto.example.estimated ? " Face points are estimated from the picture's framing, so changes can sit slightly off the features." : ""}`)] : []));
    if (!ctx.face || ctx.face.points.length !== 478) {
        main.append(h("p", { class: "notice" }, "Face points are unavailable. Choose a clear front-facing photo; no example face will be substituted."));
        return;
    }
    for (const spec of CONTROLS) {
        const input = h("input", { type: "range", min: "-100", max: "100", step: "1", value: "0",
            id: `local-${spec.id}`, "aria-label": spec.label });
        const shown = h("output", { for: input.id }, "0 · Original");
        input.addEventListener("input", () => {
            const next = Number(input.value);
            shown.textContent = `${next} · ${next === 0 ? "Original" : next < 0 ? "Reduce" : "Increase"}`;
        });
        input.addEventListener("change", () => {
            history.push({ ...values });
            history.splice(0, Math.max(0, history.length - 20));
            values[spec.id] = Number(input.value);
            revision++;
        });
        inputs.set(spec.id, input);
        controls.append(h("fieldset", { class: "proc-area" }, h("legend", {}, controlIcon(spec.id), spec.label), h("p", { class: "fine" }, spec.summary), input, shown));
    }
    const apply = h("button", { class: "btn", type: "button" }, "Show local preview");
    apply.addEventListener("click", async () => {
        const own = ++revision;
        const selected = { ...values };
        apply.disabled = true;
        try {
            const image = await dependencies.read(source);
            if (own !== revision || ctx.photoSrc !== source || ctx.face?.points !== originalPoints || !output.isConnected)
                return;
            const mesh = measuredMesh(ctx.face?.points, image.width, image.height);
            const result = renderShape(image, mesh, selected);
            clear(output);
            output.append(dependencies.paint(result.image, result.label), h("p", { class: "fine" }, `Movement guard retained ${Math.round(result.metrics.guard_scale * 100)}% of the requested movement.`));
            announce("Local preview ready.");
        }
        catch (error) {
            if (own === revision && ctx.photoSrc === source) {
                clear(output);
                output.append(localPreviewError(error));
            }
        }
        finally {
            apply.disabled = false;
        }
    });
    const sync = () => {
        for (const [id, input] of inputs) {
            input.value = String(values[id] ?? 0);
            const label = input.nextElementSibling;
            if (label)
                label.textContent = `${input.value} · ${Number(input.value) === 0 ? "Original" : Number(input.value) < 0 ? "Reduce" : "Increase"}`;
        }
        clear(output);
        revision++;
    };
    const undo = h("button", { class: "btn btn-quiet", type: "button", onclick: () => {
            const previous = history.pop();
            if (!previous)
                return;
            for (const key of Object.keys(values))
                delete values[key];
            Object.assign(values, previous);
            sync();
        } }, "Undo");
    const reset = h("button", { class: "btn btn-quiet", type: "button", onclick: () => {
            history.push({ ...values });
            for (const key of Object.keys(values))
                delete values[key];
            sync();
        } }, "Reset to original");
    main.append(controls, h("div", { class: "row" }, apply, undo, reset), output, facePartsSection(ctx, dependencies), expressionsSection(ctx, dependencies), ...moreSimulations(ctx, dependencies));
}
