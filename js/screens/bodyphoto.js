/** Shared picker for the waist up or full length photo used by Outfit and Body. */
import { api } from "../api.js";
import { estimateBody } from "../body/measure.js";
import { readPose } from "../body/pose.js";
import { clear, h, loadImage } from "../dom.js";
import { errorBox, filePicker } from "../ui/widgets.js";
export function heightInput(ctx, onChange) {
    const input = h("input", { type: "number", id: "height-cm", min: "120", max: "230", step: "0.5", inputmode: "decimal",
        value: ctx.body?.heightCm ? String(ctx.body.heightCm) : "" });
    input.addEventListener("change", () => {
        const v = Number(input.value);
        if (ctx.body) {
            ctx.body.heightCm = v >= 120 && v <= 230 ? v : null;
            const p = ctx.body.pose;
            ctx.body.estimate = p && ctx.body.heightCm ? estimateBody(p.landmarks, p.mask, p.width, p.height, ctx.body.heightCm) : null;
        }
        onChange();
    });
    return h("p", { class: "field" }, h("label", { for: "height-cm" }, "Your height in cm"), input);
}
/** `upload` is true only where the server needs the photo (outfit try on). */
export function bodyPhotoPicker(ctx, onReady, upload = true) {
    const status = h("div", { "aria-live": "polite" });
    const adopt = async (src, blob, existing) => {
        clear(status);
        status.append(h("p", { class: "source" }, "Reading your pose on this device..."));
        try {
            const img = await loadImage(src);
            const pose = await readPose(img);
            const photo = existing ?? (upload && blob ? await api.uploadPhoto(blob) : null);
            const heightCm = ctx.body?.heightCm ?? null;
            ctx.body = {
                photo: photo ? { ...photo, sample: existing?.sample ?? false } : null, blob, src, pose,
                estimate: pose && heightCm ? estimateBody(pose.landmarks, pose.mask, pose.width, pose.height, heightCm) : null,
                heightCm,
            };
            clear(status);
            if (!pose)
                status.append(h("p", { class: "notice notice-warn" }, "Body points couldn't be read in this browser, so measurements from the photo are off. You can still type yours in."));
            onReady();
        }
        catch (err) {
            clear(status);
            status.append(errorBox(err));
        }
    };
    const current = ctx.body
        ? h("figure", { class: "body-thumb" }, h("img", { src: ctx.body.src, alt: "Your outfit and body photo" }))
        : null;
    return h("div", { class: "body-photo" }, current, h("p", { class: "fine" }, "Stand facing the camera in fitted clothes, arms a little away from your sides, whole body in the frame. For tops, waist up is enough."), upload ? null : h("p", { class: "fine" }, "This photo stays in your browser."), h("div", { class: "row" }, filePicker(ctx.body ? "Use a different photo" : "Add a full length photo", "image/jpeg,image/png", (f) => void adopt(URL.createObjectURL(f), f), !!ctx.body), ctx.photo && !ctx.body ? h("button", { class: "btn btn-quiet", onclick: () => void adopt(ctx.photoSrc, null, ctx.photo) }, "Use my face photo") : null), status);
}
