/**
 * 33-point 3D LUT bake and tetrahedral apply, mirroring api/plumb_api/filters/colour/lut.py.
 *
 * Layout: flat Float64Array, index ((i * N + j) * N + k) * 3 + channel, red slowest; lattice
 * point (i, j, k) holds the look applied to sRGB (i, j, k) / (N - 1). Tetrahedral
 * interpolation (Kasson, Nin, Plouffe and Hafner, 1995) picks one of six tetrahedra with the
 * same comparisons and arithmetic order as the Python port, so lattice colours return exactly
 * and greys stay grey. Applying to bytes uses a 256-entry index/fraction table per channel.
 * Tetrahedral interpolation; concept only, no code copied.
 * Author: John Khan.
 */
import { roundHalfEven } from "../../engines/core/buffer.js";
import { clamp01 } from "./space.js";
export const SIZE = 33;
export function lattice(size = SIZE) {
    if (!(Number.isInteger(size) && size >= 2 && size <= 65))
        throw new RangeError("LUT size must be 2 to 65");
    const out = new Float64Array(size ** 3 * 3);
    let p = 0;
    for (let i = 0; i < size; i++)
        for (let j = 0; j < size; j++)
            for (let k = 0; k < size; k++) {
                out[p++] = i / (size - 1);
                out[p++] = j / (size - 1);
                out[p++] = k / (size - 1);
            }
    return out;
}
/** Bake `transform` (in place over r, g, b triples) on the lattice; values clipped to [0, 1]. */
export function bake(transform, size = SIZE) {
    const table = lattice(size);
    transform(table);
    for (let i = 0; i < table.length; i++) {
        const v = table[i];
        if (!Number.isFinite(v))
            throw new RangeError("a LUT transform must return finite colours");
        table[i] = clamp01(v);
    }
    return table;
}
export const identity = (size = SIZE) => lattice(size);
/** Tetrahedral interpolation of one colour; writes into out[o..o+2]. */
export function applyOne(table, r, g, b, out, o, size = SIZE) {
    const xr = clamp01(r) * (size - 1), xg = clamp01(g) * (size - 1), xb = clamp01(b) * (size - 1);
    const ir = Math.min(Math.floor(xr), size - 2), ig = Math.min(Math.floor(xg), size - 2), ib = Math.min(Math.floor(xb), size - 2);
    corner(table, ir, ig, ib, xr - ir, xg - ig, xb - ib, out, o, size);
}
function corner(t, ir, ig, ib, fr, fg, fb, out, o, size) {
    const s2 = size * size;
    const at = (dr, dg, db) => (((ir + dr) * s2 + (ig + dg) * size + (ib + db)) * 3);
    const c000 = at(0, 0, 0), c111 = at(1, 1, 1);
    for (let c = 0; c < 3; c++) {
        const v000 = t[c000 + c], v111 = t[c111 + c];
        let v;
        if (fr > fg) {
            if (fg > fb) {
                const v100 = t[at(1, 0, 0) + c], v110 = t[at(1, 1, 0) + c];
                v = v000 + fr * (v100 - v000) + fg * (v110 - v100) + fb * (v111 - v110);
            }
            else if (fr > fb) {
                const v100 = t[at(1, 0, 0) + c], v101 = t[at(1, 0, 1) + c];
                v = v000 + fr * (v100 - v000) + fb * (v101 - v100) + fg * (v111 - v101);
            }
            else {
                const v001 = t[at(0, 0, 1) + c], v101 = t[at(1, 0, 1) + c];
                v = v000 + fb * (v001 - v000) + fr * (v101 - v001) + fg * (v111 - v101);
            }
        }
        else if (fb > fg) {
            const v001 = t[at(0, 0, 1) + c], v011 = t[at(0, 1, 1) + c];
            v = v000 + fb * (v001 - v000) + fg * (v011 - v001) + fr * (v111 - v011);
        }
        else if (fb > fr) {
            const v010 = t[at(0, 1, 0) + c], v011 = t[at(0, 1, 1) + c];
            v = v000 + fg * (v010 - v000) + fb * (v011 - v010) + fr * (v111 - v011);
        }
        else {
            const v010 = t[at(0, 1, 0) + c], v110 = t[at(1, 1, 0) + c];
            v = v000 + fg * (v010 - v000) + fr * (v110 - v010) + fb * (v111 - v110);
        }
        out[o + c] = v;
    }
}
/** Apply to a Float64Array of r, g, b triples in [0, 1]; returns a new array. */
export function apply(table, rgb, size = SIZE) {
    const out = new Float64Array(rgb.length);
    for (let i = 0; i < rgb.length; i += 3)
        applyOne(table, rgb[i], rgb[i + 1], rgb[i + 2], out, i, size);
    return out;
}
const byteTables = new Map();
function byteTable(size) {
    let t = byteTables.get(size);
    if (!t) {
        const index = new Int32Array(256), frac = new Float64Array(256);
        for (let v = 0; v < 256; v++) {
            const x = (v / 255) * (size - 1);
            index[v] = Math.min(Math.floor(x), size - 2);
            frac[v] = x - index[v];
        }
        t = { index, frac };
        byteTables.set(size, t);
    }
    return t;
}
/** Bytes (RGB or RGBA, `channels` apart) through the LUT to encoded floats in [0, 1]. */
export function applyBytes(table, data, channels, size = SIZE) {
    const { index, frac } = byteTable(size);
    const pixels = data.length / channels;
    const out = new Float64Array(pixels * 3);
    for (let p = 0, q = 0; p < pixels; p++, q += 3) {
        const r = data[p * channels], g = data[p * channels + 1], b = data[p * channels + 2];
        corner(table, index[r], index[g], index[b], frac[r], frac[g], frac[b], out, q, size);
    }
    return out;
}
/** Encoded floats to bytes, round half to even (NumPy rint). */
export function toBytes(unit) {
    const out = new Uint8Array(unit.length);
    for (let i = 0; i < unit.length; i++)
        out[i] = roundHalfEven(clamp01(unit[i]) * 255);
    return out;
}
/** LUT values at integer lattice indices, for parity checks. */
export function sample(table, points, size = SIZE) {
    return points.map(([i, j, k]) => { const at = ((i * size + j) * size + k) * 3; return [table[at], table[at + 1], table[at + 2]]; });
}
//# sourceMappingURL=lut.js.map