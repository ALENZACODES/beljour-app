/** Highlight-edge halation with unchanged highlight cores and original texture.
 * The source/halo subtraction matches api/plumb_api/filters/spatial/halation.py.
 * Created by John Khan.
 */
import { floatImage } from "../../engines/core/buffer.js";
import { boxMean } from "../../engines/core/filters.js";
import { fixed, num, register } from "../colour/ops.js";
import { clamp01, decode1, encode1, luminance, smoothstep } from "../colour/space.js";
import { PASSES, glowRadius } from "./glow.js";
export function highlightFringe(block, params, frame) {
    const { width, height } = block;
    const amount = params.amount;
    if (amount <= 0)
        return { width, height, data: Float64Array.from(block.data) };
    const linear = Float64Array.from(block.data, (v) => decode1(v));
    const source = floatImage(width, height, 3, true);
    for (let p = 0; p < linear.length; p += 3) {
        const bright = smoothstep(params.threshold, 1, luminance(linear[p], linear[p + 1], linear[p + 2]));
        source.data[p] = linear[p] * bright;
        source.data[p + 1] = linear[p + 1] * bright;
        source.data[p + 2] = linear[p + 2] * bright;
    }
    const radius = glowRadius(params.radius, frame);
    let blurred = source;
    for (let pass = 0; pass < PASSES; pass++)
        blurred = boxMean(blurred, radius);
    const warmth = params.warmth;
    const gains = [1, 1 - 0.65 * warmth, 1 - 0.85 * warmth];
    const out = new Float64Array(linear.length);
    for (let i = 0; i < linear.length; i++) {
        const fringe = clamp01(blurred.data[i] - source.data[i]) * gains[i % 3];
        out[i] = encode1(1 - (1 - linear[i]) * (1 - amount * fringe));
    }
    return { width, height, data: out };
}
register({
    name: "spatial.halation", family: "spatial", skinHue: false, image: highlightFringe,
    params: {
        amount: num(0, 0, 1, "strength of the halo outside a highlight"),
        threshold: fixed(0.72, 0.2, 0.98, "minimum source luminance"),
        radius: fixed(0.025, 0.002, 0.08, "blur radius share of photo"),
        warmth: fixed(0.85, 0, 1, "warm red-orange tint of the fringe"),
    },
    halo: (p, frame) => PASSES * glowRadius(p.radius, frame),
    help: "Highlight-edge halation preserving sharp highlight cores",
});
//# sourceMappingURL=halation.js.map