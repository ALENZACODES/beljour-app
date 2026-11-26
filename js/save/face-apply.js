/** Strict per-face edits in batch and group photos; no full-image side effects.
 *
 * All engines still receive the full image/landmark coordinate system; however
 * only values inside the explicitly selected face boxes are composited back.
 * The original photograph is unchanged and only selected IDs are permitted.
 * This is a *safety boundary*, not a high-quality feathered face-segmentation
 * engine. Filters needing region-accurate masks must inject their own renderer.
 * Author: John Khan.
 */
import { applyLook, copyPhoto } from "./looks.js";
export function faceRect(face, photo) {
    if (!face.id || face.id.length > 100 || !face.box.every(Number.isFinite))
        throw new RangeError("invalid selected face identity or box");
    const [x, y, width, height] = face.box;
    if (width <= 0 || height <= 0 || width > photo.width * 3 || height > photo.height * 3) {
        throw new RangeError("selected face bounding box is invalid");
    }
    const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y));
    const right = Math.min(photo.width, Math.ceil(x + width)), bottom = Math.min(photo.height, Math.ceil(y + height));
    if (right <= left || bottom <= top)
        throw new RangeError("selected face bounding box lies outside image");
    return { left, top, right, bottom };
}
export function mergeSelectedPixels(source, rendered, face) {
    if (source.width !== rendered.width || source.height !== rendered.height || source.channels !== rendered.channels ||
        source.data.length !== source.width * source.height * source.channels || rendered.data.length !== source.data.length ||
        !Number.isInteger(source.width) || !Number.isInteger(source.height) || ![3, 4].includes(source.channels)) {
        throw new RangeError("selected face overlay must match a valid original RGB(A) photo");
    }
    const rectangle = faceRect(face, source);
    const out = copyPhoto(source);
    const { left, right, top, bottom } = rectangle;
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const index = (y * source.width + x) * source.channels;
            for (let channel = 0; channel < source.channels; channel++)
                out.data[index + channel] = rendered.data[index + channel];
        }
    }
    return out;
}
/** Apply each face's independently adapted dose, retaining all unselected pixels. */
export function applyLookToFaces(look, source, selected, engine, options = {}) {
    if (!selected.length || selected.length > 32)
        throw new RangeError("choose 1 to 32 faces");
    const seen = new Set();
    // Validate every selection before running any expensive engine.
    for (const face of selected) {
        if (seen.has(face.id))
            throw new RangeError("a face cannot be selected twice");
        seen.add(face.id);
        faceRect(face, source);
    }
    const reports = [];
    let current = copyPhoto(source);
    for (const face of selected) {
        const dose = options.doseFor?.(face) ?? 1;
        if (!Number.isFinite(dose) || dose < 0 || dose > 1)
            throw new RangeError("adaptive dose must be in 0..1");
        const report = applyLook(look, source, engine, {
            version: options.version, dose, youcamAvailable: options.youcamAvailable,
        });
        // The render is from the original photo for EACH face. Overlapping boxes
        // obey selected ordering, and no engine gets access to the prior face edit.
        current = mergeSelectedPixels(current, report.photo, face);
        reports.push(report);
    }
    return { photo: current, faceIds: selected.map((f) => f.id), reports,
        simulationLabel: "Selected-face rectangular containment; not pixel-exact segmentation" };
}
//# sourceMappingURL=face-apply.js.map