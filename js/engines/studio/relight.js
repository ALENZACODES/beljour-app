/** Studio relight: a soft key light across her face, inside her person area, normalised so
 * her face's average brightness stays where it was (it never lightens her skin). Mirrors
 * api/plumb_api/engines/studio/relight.py. Author: John Khan.
 */
import { faceBox, faceRange, finish, personMask, photo, radiusFor, softBlur, strength, StudioRefusal } from "./common.js";
export const MAX_GAIN = 0.15;
export const SIDES = Object.freeze({ left: 180, right: 0, "upper-left": 215, "upper-right": 325 });
export const LABEL = "Lighting simulation. The average brightness of your face is kept.";
export function lightField(width, height, box, side, share) {
    if (!(side in SIDES))
        throw new RangeError(`side must be one of ${Object.keys(SIDES).join(", ")}`);
    const [x0, y0, x1, y1] = box;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, span = Math.max(1, (x1 - x0) / 2);
    const angle = SIDES[side] * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle);
    const out = new Float64Array(width * height);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const d = Math.min(1, Math.max(-1, ((x - cx) * co + (y - cy) * si) / (2 * span)));
            out[y * width + x] = 1 + MAX_GAIN * share * d * (1.5 - 0.5 * d * d);
        }
    return out;
}
export function applyLight(rgb, person, width, height, box, side, share) {
    const field = lightField(width, height, box, side, share);
    const [r0, r1, c0, c1] = faceRange(box, width, height);
    let face = 0, num = 0, den = 0;
    for (let y = r0; y < r1; y++)
        for (let x = c0; x < c1; x++) {
            const i = y * width + x;
            face += person[i];
            const w = person[i] * ((rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3);
            num += field[i] * w;
            den += w;
        }
    if (face < 16)
        throw new StudioRefusal("face_outside_person", "Her face points are outside the person area.");
    const raw = num / Math.max(den, 1e-9);
    const where = softBlur(person, width, height, radiusFor(width, height, 1 / 200));
    const out = new Float64Array(rgb.length);
    for (let i = 0; i < person.length; i++) {
        const g = 1 + (field[i] / raw - 1) * where[i];
        for (let k = 0; k < 3; k++)
            out[i * 3 + k] = rgb[i * 3 + k] * g;
    }
    return { rgb: out, raw };
}
export function relight(image, coarse, points, side = "upper-left", amount = 50) {
    const p = photo(image);
    const share = strength(amount);
    const person = personMask(coarse, p.width, p.height);
    const box = faceBox(points);
    if (share === 0)
        return { image: Uint8Array.from(image.data), channels: image.channels, label: LABEL, crops: [], metrics: { tool: "relight", no_op: true } };
    const lit = applyLight(p.rgb, person, p.width, p.height, box, side, share);
    const out = finish(lit.rgb, p.alpha);
    return { image: out.data, channels: out.channels, label: LABEL, crops: [],
        metrics: { tool: "relight", side, gain_before_balance: lit.raw, max_gain: MAX_GAIN * share } };
}
//# sourceMappingURL=relight.js.map