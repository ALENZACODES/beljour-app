/**
 * Small-scale luminance structure above a noise threshold.
 * The whole-photo radius and protected highlights match structure.py.
 * All pixels are computed on device with no external model or asset.
 * Created by John Khan.
 */
import { floatImage } from "../../engines/core/buffer.js";
import { boxMean } from "../../engines/core/filters.js";
import { fixed, num, register } from "../colour/ops.js";
import { clamp01 } from "../colour/space.js";
import { glowRadius } from "./glow.js";
export const DETAIL_GAIN = 0.42;
export const MAX_DELTA = 0.045;
export const HEADROOM_SCALE = 10;
export function structureRadius(share, frame) {
    return glowRadius(share, frame);
}
export function structure(block, params, frame) {
    const { width, height } = block;
    const amount = params.amount;
    const out = Float64Array.from(block.data);
    if (amount <= 0)
        return { width, height, data: out };
    const luma = floatImage(width, height, 1, true);
    for (let i = 0, p = 0; i < out.length; i += 3, p++) {
        luma.data[p] = out[i] * 0.2126 + out[i + 1] * 0.7152 + out[i + 2] * 0.0722;
    }
    const local = boxMean(luma, structureRadius(params.radius, frame));
    const floor = params.threshold;
    for (let p = 0; p < width * height; p++) {
        const i = p * 3;
        const raw = luma.data[p] - local.data[p];
        const signed = Math.sign(raw) * Math.max(Math.abs(raw) - floor, 0);
        const room = Math.min(out[i], out[i + 1], out[i + 2], 1 - out[i], 1 - out[i + 1], 1 - out[i + 2]);
        const headroom = clamp01(room * HEADROOM_SCALE);
        const delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, signed * amount * DETAIL_GAIN)) * headroom;
        out[i] = clamp01(out[i] + delta);
        out[i + 1] = clamp01(out[i + 1] + delta);
        out[i + 2] = clamp01(out[i + 2] + delta);
    }
    return { width, height, data: out };
}
register({
    name: "spatial.structure", family: "spatial", skinHue: false, image: structure,
    params: {
        amount: num(0, 0, 1, "micro-contrast gain above the noise floor"),
        radius: fixed(0.012, 0.002, 0.036, "full-photo detail scale"),
        threshold: fixed(0.015, 0, 0.06, "ignore weak random pixel noise"),
    },
    halo: (params, frame) => structureRadius(params.radius, frame),
    help: "Restrained local luminance structure without face reshaping",
});
