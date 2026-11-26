/**
 * Highlight glow and diffusion (spatial.glow), mirroring api/plumb_api/filters/spatial/glow.py.
 *
 * Highlights (a smooth weight from `threshold` to white on linear luminance) are blurred with
 * three passes of the core box mean (engines/core/filters.ts, replicated edges, the same
 * prefix-sum maths as Python), tinted, and screened over the photo in linear light:
 * out = 1 - (1 - photo) (1 - amount * blurred). Screening adds light; it never averages
 * skin pixels together, so texture and marks stay. The radius is a share of the whole
 * photo's short side; `halo` is what a tile needs around it (three passes reach 3 x radius).
 * The Orton soft-focus technique is the idea behind it; concept only, no code copied.
 * Author: John Khan.
 */
import { floatImage } from "../../engines/core/buffer.js";
import { boxMean } from "../../engines/core/filters.js";
import { fixed, num, register } from "../colour/ops.js";
import { clamp01, decode1, encode1, luminance, smoothstep } from "../colour/space.js";
export const PASSES = 3;
export const MAX_RADIUS_SHARE = 0.08;
export const shortSide = (frame) => Math.min(frame.width, frame.height);
/** Python's round() is half to even; a radius rarely sits on .5, but match it anyway. */
function pyRound(x) {
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
/** Box radius in pixels for one pass: half the requested share of the short side, at least 1. */
export function glowRadius(radiusShare, frame) {
    return Math.max(1, pyRound((radiusShare * shortSide(frame)) / 2));
}
export function glow(block, p, frame) {
    const amount = p.amount;
    const { width: w, height: h } = block;
    if (amount <= 0)
        return { width: w, height: h, data: Float64Array.from(block.data) };
    const lin = new Float64Array(block.data.length);
    for (let i = 0; i < lin.length; i++)
        lin[i] = decode1(block.data[i]);
    const hl = floatImage(w, h, 3, true);
    const threshold = p.threshold;
    for (let i = 0; i < lin.length; i += 3) {
        const weight = smoothstep(threshold, 1, luminance(lin[i], lin[i + 1], lin[i + 2]));
        hl.data[i] = lin[i] * weight;
        hl.data[i + 1] = lin[i + 1] * weight;
        hl.data[i + 2] = lin[i + 2] * weight;
    }
    const radius = glowRadius(p.radius, frame);
    let blurred = hl;
    for (let k = 0; k < PASSES; k++)
        blurred = boxMean(blurred, radius);
    const warmth = p.warmth;
    const gains = [1 + 0.2 * warmth, 1, 1 - 0.2 * warmth];
    const out = new Float64Array(lin.length);
    for (let i = 0; i < lin.length; i++) {
        const b = clamp01(blurred.data[i] * gains[i % 3]);
        out[i] = encode1(1 - (1 - lin[i]) * (1 - amount * b));
    }
    return { width: w, height: h, data: out };
}
register({
    name: "spatial.glow", family: "spatial", skinHue: false,
    params: { amount: num(0, 0, 1, "how much light the glow adds"), threshold: fixed(0.7, 0.2, 0.98, "luminance where highlights start"),
        radius: fixed(0.02, 0.002, MAX_RADIUS_SHARE, "blur as a share of the short side"), warmth: num(0, -1, 1, "warm +, cool -") },
    image: glow,
    halo: (p, frame) => PASSES * glowRadius(p.radius, frame),
    help: "Highlight glow screened over the photo; never blurs skin",
});
//# sourceMappingURL=glow.js.map