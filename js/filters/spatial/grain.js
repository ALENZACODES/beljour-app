/**
 * Original deterministic grain in full-photo coordinates.
 * The 32-bit mixer and halfword normalization match spatial/grain.py.
 * No GPU readback, random global state, external image or remote service.
 * Created by John Khan.
 */
import { fixed, num, register } from "../colour/ops.js";
import { clamp01 } from "../colour/space.js";
export const GRAIN_SEED = 104729;
export const MAX_GRAIN = 0.032;
export const EDGE_HEADROOM = 10;
function mix32(value) {
    let h = value >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
/** Stable signed field for the same photo size, coordinate and seed. */
export function grainNoise(x, y, frame, seed = GRAIN_SEED) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new RangeError("grain seed must be a 32-bit unsigned integer");
    }
    let h = seed >>> 0;
    h ^= Math.imul(x, 0x9e3779b1) >>> 0;
    h ^= Math.imul(y, 0x85ebca77) >>> 0;
    h ^= Math.imul(frame.width, 0xc2b2ae3d) >>> 0;
    h ^= Math.imul(frame.height, 0x27d4eb2f) >>> 0;
    const result = mix32(h);
    return ((result & 0xffff) + (result >>> 16)) / 65535 - 1;
}
export function grain(block, params, frame) {
    const { width, height } = block;
    const amount = params.amount;
    const out = Float64Array.from(block.data);
    if (amount <= 0)
        return { width, height, data: out };
    const seed = params.seed;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new RangeError("grain seed must be a 32-bit unsigned integer");
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            const room = Math.min(out[i], out[i + 1], out[i + 2], 1 - out[i], 1 - out[i + 1], 1 - out[i + 2]);
            const headroom = clamp01(room * EDGE_HEADROOM);
            const delta = grainNoise(x + frame.x0, y + frame.y0, frame, seed) * amount * MAX_GRAIN * headroom;
            out[i] = clamp01(out[i] + delta);
            out[i + 1] = clamp01(out[i + 1] + delta);
            out[i + 2] = clamp01(out[i + 2] + delta);
        }
    }
    return { width, height, data: out };
}
register({
    name: "spatial.grain", family: "spatial", skinHue: false, image: grain,
    params: {
        amount: num(0, 0, 1, "fine original monochrome grain strength"),
        seed: fixed(GRAIN_SEED, 0, 0xffffffff, "fixed local coordinate seed"),
    },
    halo: () => 0,
    help: "Deterministic fine grain without whitening highlights or smearing texture",
});
