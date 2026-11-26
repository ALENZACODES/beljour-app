/**
 * Procedural sparkle for the evening portrait look, the browser twin of
 * api/plumb_api/filters/portrait/sparkle.py: integer-hashed glints in square cells a tenth of
 * the inter-ocular distance, each a soft core plus a thin four-point star, only on
 * the upper lids and cheekbone tops inside the skin, added in linear light. No image assets.
 * Author: John Khan.
 */
import { roundHalfEven } from "../../engines/core/buffer.js";
import { decode1, encode1 } from "../colour/space.js";
import { toBytes } from "../colour/lut.js";
export const CELL_IOD = 0.1; // cell side as a share of the IOD; ASSUMED
export const GLINT_IOD = 0.022; // core radius as a share of the IOD; ASSUMED
export const STAR_REACH = 2.5; // star arm length in core radii; ASSUMED
export const STAR_SHARE = 0.45; // star arms' brightness against the core; ASSUMED
export const RIGHT_EYE = [33, 133, 159];
export const LEFT_EYE = [263, 362, 386];
export const RIGHT_CHEEK = [50, 116];
export const LEFT_CHEEK = [280, 345];
export const EDGE = 0.3; // soft edge of the region ellipses; ASSUMED
export function hash32(a, b, seed) {
    let v = (Math.imul(a, 73856093) + Math.imul(b, 19349663) + Math.imul(seed, 83492791)) >>> 0;
    v = (v ^ (v >>> 13)) >>> 0;
    v = Math.imul(v, 1274126177) >>> 0;
    return (v ^ (v >>> 16)) >>> 0;
}
function ellipseInto(out, width, height, cx, cy, rx, ry) {
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
            const a = Math.min(1, Math.max(0, (1 - Math.sqrt(dx * dx + dy * dy)) / EDGE));
            const p = y * width + x;
            if (a > out[p])
                out[p] = a;
        }
}
/** Upper lids and cheekbone tops, on pixels that are mostly skin. */
export function region(points, skin, width, height, iod) {
    const out = new Float64Array(width * height);
    for (const [outer, inner, lid] of [RIGHT_EYE, LEFT_EYE]) {
        const ex = points[inner][0] - points[outer][0], ey = points[inner][1] - points[outer][1];
        const span = Math.sqrt(ex * ex + ey * ey);
        ellipseInto(out, width, height, (points[outer][0] + points[inner][0]) / 2, points[lid][1] - 0.35 * span, 0.62 * span, 0.45 * span);
    }
    for (const [a, b] of [RIGHT_CHEEK, LEFT_CHEEK]) {
        ellipseInto(out, width, height, (points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2, 0.30 * iod, 0.17 * iod);
    }
    for (let p = 0; p < out.length; p++)
        out[p] *= Math.min(1, Math.max(0, 2 * skin[p] - 1));
    return out;
}
export function glints(area, width, height, iod, spec) {
    const cell = Math.max(2, roundHalfEven(iod * CELL_IOD));
    const level = new Float64Array(width * height), colour = new Int32Array(width * height);
    let count = 0;
    const threshold = spec.density * 65536;
    for (let j = 0; j < Math.ceil(height / cell); j++)
        for (let i = 0; i < Math.ceil(width / cell); i++) {
            const hv = hash32(i, j, spec.seed);
            if ((hv & 0xffff) >= threshold)
                continue;
            const px = (i + ((hv >>> 16) & 0xff) / 255) * cell, py = (j + ((hv >>> 24) & 0xff) / 255) * cell;
            const xi = Math.floor(px), yi = Math.floor(py);
            if (!(xi >= 0 && xi < width && yi >= 0 && yi < height) || area[yi * width + xi] < 0.5)
                continue;
            const h2 = hash32(i, j, spec.seed + 1);
            const radius = Math.max(0.8, iod * GLINT_IOD) * (0.6 + 0.8 * (h2 & 0xff) / 255);
            const bright = 0.55 + 0.45 * ((h2 >>> 16) & 0xff) / 255;
            const pick = (h2 >>> 8) % spec.palette.length;
            const reach = Math.ceil(STAR_REACH * radius), thin = 0.35 * radius + 0.5;
            for (let y = Math.max(0, yi - reach); y < Math.min(height, yi + reach + 1); y++) {
                for (let x = Math.max(0, xi - reach); x < Math.min(width, xi + reach + 1); x++) {
                    const dx = x + 0.5 - px, dy = y + 0.5 - py;
                    let core = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / radius);
                    core = core * core;
                    const armX = Math.max(0, 1 - Math.abs(dx) / (STAR_REACH * radius)) * Math.max(0, 1 - Math.abs(dy) / thin);
                    const armY = Math.max(0, 1 - Math.abs(dy) / (STAR_REACH * radius)) * Math.max(0, 1 - Math.abs(dx) / thin);
                    const p = y * width + x;
                    const value = Math.min(1, core + STAR_SHARE * Math.max(armX, armY)) * bright * area[p];
                    if (value > level[p]) {
                        level[p] = value;
                        colour[p] = pick;
                    }
                }
            }
            count++;
        }
    return { level, colour, count };
}
/** Add the glints to RGB bytes at `scale` (the slider, 0-1) of the look's amount. */
export function render(rgb, width, height, area, iod, spec, scale) {
    const g = glints(area, width, height, iod, spec);
    if (scale === 0 || g.count === 0)
        return { image: Uint8Array.from(rgb), glints: g };
    const palette = spec.palette.map((c) => c.map((v) => decode1(v / 255)));
    const out = new Float64Array(rgb.length);
    for (let p = 0; p < width * height; p++) {
        const add = spec.amount * scale * g.level[p];
        for (let c = 0; c < 3; c++) {
            const lin = decode1(rgb[p * 3 + c] / 255) + add * palette[g.colour[p]][c];
            out[p * 3 + c] = encode1(Math.min(1, Math.max(0, lin)));
        }
    }
    return { image: toBytes(out), glints: g };
}
//# sourceMappingURL=sparkle.js.map