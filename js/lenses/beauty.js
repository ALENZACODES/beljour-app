import { renderSkinTool } from "../engines/skin/studio.js";
import { regionMask } from "../data/regions/index.js";
import { texturePreview } from "../screens/local-preview.js";
export const BEAUTY_LABEL = "Beauty lens: local makeup and skin finish, never lighter. A simulation; not medical advice.";
export const HEAVY = new Set(["glow", "matte", "tone", "freckles", "tan", "smooth"]);
/** Steps that need the real eye and lip outlines: skipped when the face points are only an
 * estimate (the example pictures' fixed framing), where they would land beside the feature. */
export const PRECISE = new Set(["lips", "shadow", "liner"]);
const UPPER_LID = { right: [33, 246, 161, 160, 159, 158, 157, 173, 133], left: [263, 466, 388, 387, 386, 385, 384, 398, 362] };
const copy = (image) => ({ ...image, data: new Uint8ClampedArray(image.data) });
/** Multiply `colour` into `out` with per-pixel weight `at(x, y)` (0..1) inside a bounding box. */
function tint(out, colour, box, at) {
    const [x0, y0, x1, y1] = box.map(Math.round);
    for (let y = Math.max(0, y0); y <= Math.min(out.height - 1, y1); y++)
        for (let x = Math.max(0, x0); x <= Math.min(out.width - 1, x1); x++) {
            const a = at(x + 0.5, y + 0.5);
            if (!(a > 0))
                continue;
            const i = (y * out.width + x) * out.channels;
            for (let k = 0; k < 3; k++) {
                const v = out.data[i + k];
                out.data[i + k] = Math.round(v + Math.min(1, a) * (v * colour[k] / 255 - v));
            }
        }
}
function ellipseAt(out, c, rx, ry, f, colour, amount) {
    const r = Math.max(rx, ry);
    tint(out, colour, [c[0] - r, c[1] - r, c[0] + r, c[1] + r], (x, y) => {
        const dx = x - c[0], dy = y - c[1], du = dx * f.u[0] + dy * f.u[1], dv = dx * f.v[0] + dy * f.v[1];
        const e = (du / rx) ** 2 + (dv / ry) ** 2;
        return e < 1 ? amount * (1 - e) ** 1.5 : 0;
    });
}
function segmentDistance(px, py, a, b) {
    const ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    return Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t);
}
/** Run one beauty step. Returns the new image (a refused skin tool leaves it as it was). */
export function beautyStep(image, points, f, s, share) {
    const amount = Math.max(0, Math.min(100, s.strength * share));
    if (amount === 0)
        return image;
    if (s.step === "smooth")
        return texturePreview(image, points, amount / 100);
    if (s.step === "glow" || s.step === "matte" || s.step === "tone" || s.step === "freckles" || s.step === "tan") {
        const params = s.step === "freckles" ? { density: s.density, seed: 11 } : s.step === "tan" ? { direction: "add" } : {};
        const result = renderSkinTool(s.step, image, points, Math.round(amount), params);
        return "refused" in result ? image : { ...image, data: new Uint8ClampedArray(result.image) };
    }
    if (!("colour" in s))
        return image;
    const out = copy(image), w = f.width, a = amount / 100, colour = s.colour;
    if (s.step === "lips") {
        const lips = regionMask("lips", points, image.width, image.height, { normalized: false });
        const [mx, my] = [(points[61][0] + points[291][0]) / 2, (points[61][1] + points[291][1]) / 2];
        tint(out, colour, [mx - 0.4 * w, my - 0.25 * w, mx + 0.4 * w, my + 0.25 * w], (x, y) => lips.data[Math.floor(y) * image.width + Math.floor(x)] * a);
    }
    else if (s.step === "blush") {
        for (const p of [points[205], points[425]])
            ellipseAt(out, [p[0], p[1] - 0.02 * w], 0.17 * w, 0.11 * w, f, colour, a);
    }
    else if (s.step === "shadow") {
        for (const [lid, brow] of [[159, 105], [386, 334]]) {
            const c = [(points[lid][0] * 2 + points[brow][0]) / 3, (points[lid][1] * 2 + points[brow][1]) / 3];
            ellipseAt(out, c, 0.11 * w, 0.045 * w, f, colour, a * 0.8);
        }
    }
    else {
        const thick = Math.max(1, 0.008 * w);
        for (const ids of [UPPER_LID.right, UPPER_LID.left]) {
            const line = ids.map((i) => points[i]);
            const xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
            tint(out, colour, [Math.min(...xs) - thick * 2, Math.min(...ys) - thick * 2, Math.max(...xs) + thick * 2, Math.max(...ys) + thick * 2], (x, y) => {
                let d = Infinity;
                for (let k = 1; k < line.length; k++)
                    d = Math.min(d, segmentDistance(x, y, line[k - 1], line[k]));
                return d <= thick ? a : d <= thick * 2 ? a * (2 - d / thick) : 0;
            });
        }
    }
    return out;
}
/** Every step of a beauty recipe in order; `heavy = false` runs only the tints (live mirror);
 * `precise = false` (estimated face points) leaves out the lip, lid and liner tints. */
export function beautyLook(image, points, f, steps, share, heavy = true, precise = true) {
    let out = image;
    for (const s of steps) {
        if ((!heavy && HEAVY.has(s.step)) || (!precise && PRECISE.has(s.step)))
            continue;
        out = beautyStep(out, points, f, s, share);
    }
    return out === image ? copy(image) : out;
}
