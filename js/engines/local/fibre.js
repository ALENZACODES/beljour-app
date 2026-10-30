/** LS5 crown reading and shade card: TypeScript port of the round 1 fibre.py prototype,
 * grown to plan §8.4 (6-zone grid, scalp share, strand density, 4 levels, 14-shade card,
 * two-shade mix, coverage map) plus the drawn synthetic crown used by the checks.
 * Mirrors api/plumb_api/engines/concealer/{crown,shades,synthetic}.py (parity/spikes-r7.json).
 * Inspiration: MediaPipe Hair Segmenter (hair masks; pending, so the brushed-area fallback
 * here) and face-parsing.PyTorch (a named hair region); concept only, no code copied.
 * The density reading is a photo-based estimate. Light and parting change it. Not a diagnosis.
 * Author: John Khan.
 */
import { byteImage, decodeChannel, encodeChannel, floatImage, requireColour, roundHalfEven } from "../core/buffer.js";
import { ciede2000, labToRgb, pixelLab, rgbToLab } from "../core/colour.js";
import { validateLevel as coverLevel } from "../../commerce/strength.js";
import { boxMean, gradient, quantile } from "../core/filters.js";
import { validateAnchors } from "../menshair/render.js";
import { cutForLevel } from "./strands.js";
export const ZONES = ["frontal_left", "frontal_centre", "frontal_right", "mid", "crown", "vertex"];
export const LEVELS = ["Full", "Light thinning", "Moderate", "Visible scalp"];
export const LEVEL_LIMITS = [0.12, 0.25, 0.45]; // ASSUMED until released crown photos
export const COPY = "A photo-based estimate. Light and parting change it. Not a diagnosis.";
export const TENSOR_RADIUS = 3;
export function labPlanes(img) {
    requireColour(img);
    const n = img.width * img.height, L = new Float64Array(n), a = new Float64Array(n), b = new Float64Array(n);
    const out = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        const p = i * img.channels;
        pixelLab(img.data[p], img.data[p + 1], img.data[p + 2], out);
        L[i] = out[0];
        a[i] = out[1];
        b[i] = out[2];
    }
    return { width: img.width, height: img.height, L, a, b };
}
/** 2-means on Lab rows (centre 0 darker); stable-sort seeding identical to crown.two_means. */
export function twoMeans(values, iters = 20) {
    const n = values.length;
    if (n < 2)
        throw new RangeError("the region needs at least two pixels");
    const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => values[x][0] - values[y][0]);
    let centres = [[...values[order[Math.floor(n / 5)]]], [...values[order[Math.floor((n * 4) / 5)]]]];
    let labels = new Uint8Array(n);
    for (let it = 0; it < iters; it++) {
        const next = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const v = values[i];
            const d0 = (v[0] - centres[0][0]) ** 2 + (v[1] - centres[0][1]) ** 2 + (v[2] - centres[0][2]) ** 2;
            const d1 = (v[0] - centres[1][0]) ** 2 + (v[1] - centres[1][1]) ** 2 + (v[2] - centres[1][2]) ** 2;
            next[i] = d1 < d0 ? 1 : 0;
        }
        if (it > 0 && next.every((v, i) => v === labels[i]))
            break;
        labels = next;
        for (const k of [0, 1]) {
            const sum = [0, 0, 0];
            let count = 0;
            for (let i = 0; i < n; i++)
                if (labels[i] === k) {
                    sum[0] += values[i][0];
                    sum[1] += values[i][1];
                    sum[2] += values[i][2];
                    count++;
                }
            if (count)
                centres[k] = [sum[0] / count, sum[1] / count, sum[2] / count];
        }
    }
    if (centres[0][0] > centres[1][0]) {
        centres = [centres[1], centres[0]];
        labels = labels.map((v) => 1 - v);
    }
    return { labels, centres };
}
export function zoneGrid(box, rows = [0.30, 0.55, 0.80], cols = [1 / 3, 2 / 3], frontalAt = "top") {
    const [left, top, right, bottom] = box;
    if (!box.every(Number.isFinite) || right - left < 4 || bottom - top < 4)
        throw new RangeError("zone box must be finite and at least 4 px each way");
    if (!(0 < rows[0] && rows[0] < rows[1] && rows[1] < rows[2] && rows[2] < 1))
        throw new RangeError("row cuts must rise strictly inside (0, 1)");
    if (!(0 < cols[0] && cols[0] < cols[1] && cols[1] < 1))
        throw new RangeError("column cuts must rise strictly inside (0, 1)");
    if (frontalAt !== "top" && frontalAt !== "bottom")
        throw new RangeError("frontalAt must be top or bottom");
    return { box: [...box], rows: [...rows], cols: [...cols], frontalAt };
}
export function zoneIndex(grid, width, height) {
    const [left, top, right, bottom] = grid.box, out = new Int8Array(width * height).fill(-1);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const u = (x + 0.5 - left) / (right - left);
            let v = (y + 0.5 - top) / (bottom - top);
            if (grid.frontalAt === "bottom")
                v = 1 - v;
            if (!(u >= 0 && u < 1 && v >= 0 && v < 1))
                continue;
            const row = grid.rows.filter((c) => c <= v).length, col = grid.cols.filter((c) => c <= u).length;
            out[y * width + x] = row === 0 ? col : row + 2;
        }
    return out;
}
export function gridFor(region, rows, cols, frontalAt = "top") {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let y = 0; y < region.height; y++)
        for (let x = 0; x < region.width; x++) {
            if (region.data[y * region.width + x] >= 0.5) {
                left = Math.min(left, x);
                right = Math.max(right, x + 1);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y + 1);
            }
        }
    if (!Number.isFinite(left))
        throw new RangeError("brush the crown area first");
    return zoneGrid([left, top, right, bottom], rows, cols, frontalAt);
}
export function level(scalpShare) {
    for (let k = 0; k < LEVEL_LIMITS.length; k++)
        if (scalpShare < LEVEL_LIMITS[k])
            return LEVELS[k];
    return LEVELS[LEVELS.length - 1];
}
export function split(img, region, hairIsDarker = true) {
    const lab = labPlanes(img), n = img.width * img.height;
    const idx = [], rows = [];
    for (let i = 0; i < n; i++)
        if (region.data[i] >= 0.5) {
            idx.push(i);
            rows.push([lab.L[i], lab.a[i], lab.b[i]]);
        }
    const { labels, centres } = twoMeans(rows);
    const hairLabel = hairIsDarker ? 0 : 1;
    const hair = new Uint8Array(n), scalp = new Uint8Array(n);
    idx.forEach((p, k) => { if (labels[k] === hairLabel)
        hair[p] = 1;
    else
        scalp[p] = 1; });
    return { scalp, hair, centres: hairIsDarker ? [centres[0], centres[1]] : [centres[1], centres[0]], hairIsDarker };
}
/** Scalp pixels of another photo of the same size, against the split's two centres. */
export function classify(s, img) {
    const lab = labPlanes(img), out = new Uint8Array(img.width * img.height), [h, sc] = s.centres;
    for (let i = 0; i < out.length; i++) {
        const dh = (lab.L[i] - h[0]) ** 2 + (lab.a[i] - h[1]) ** 2 + (lab.b[i] - h[2]) ** 2;
        const ds = (lab.L[i] - sc[0]) ** 2 + (lab.a[i] - sc[1]) ** 2 + (lab.b[i] - sc[2]) ** 2;
        out[i] = ds < dh ? 1 : 0;
    }
    return out;
}
function plane(width, height, data) {
    return { width, height, channels: 1, data };
}
/** Lightness gradient magnitude times structure-tensor coherence, per pixel. */
export function strandEnergy(img, radius = TENSOR_RADIUS) {
    const lab = labPlanes(img), w = img.width, h = img.height;
    const [gx, gy] = gradient(plane(w, h, lab.L));
    const n = w * h, xx = new Float64Array(n), xy = new Float64Array(n), yy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        xx[i] = gx.data[i] * gx.data[i];
        xy[i] = gx.data[i] * gy.data[i];
        yy[i] = gy.data[i] * gy.data[i];
    }
    const jxx = boxMean(plane(w, h, xx), radius).data, jxy = boxMean(plane(w, h, xy), radius).data, jyy = boxMean(plane(w, h, yy), radius).data;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const trace = jxx[i] + jyy[i];
        const coherence = trace > 1e-12 ? Math.sqrt((jxx[i] - jyy[i]) ** 2 + 4 * jxy[i] * jxy[i]) / Math.max(trace, 1e-12) : 0;
        out[i] = Math.hypot(gx.data[i], gy.data[i]) * coherence;
    }
    return out;
}
export function readCrown(img, region, grid, hairIsDarker = true) {
    const g = grid ?? gridFor(region), parts = split(img, region, hairIsDarker), energy = strandEnergy(img);
    const index = zoneIndex(g, img.width, img.height);
    const zones = ZONES.map((name, k) => {
        let count = 0, scalp = 0, density = 0;
        for (let i = 0; i < index.length; i++)
            if (region.data[i] >= 0.5 && index[i] === k) {
                count++;
                scalp += parts.scalp[i];
                density += energy[i];
            }
        const share = count ? scalp / count : 0;
        return { zone: name, pixels: count, scalp_share: share, strand_density: count ? density / count : 0, level: count ? level(share) : "No pixels" };
    });
    let total = 0, scalp = 0;
    for (let i = 0; i < region.data.length; i++)
        if (region.data[i] >= 0.5) {
            total++;
            scalp += parts.scalp[i];
        }
    return { zones, overall_scalp_share: total ? scalp / total : 0, split: parts, grid: g, copy: COPY };
}
export const LEVEL_TINT = {
    "Full": [0, 0, 0, 0], "Light thinning": [120, 160, 220, 70], "Moderate": [40, 80, 170, 110],
    "Visible scalp": [190, 40, 60, 120], "No pixels": [0, 0, 0, 0],
};
/** The plan's fallback when the render is not realistic enough: a tinted overlay by level. */
export function coverageMap(reading, region) {
    const out = byteImage(region.width, region.height, 4), index = zoneIndex(reading.grid, region.width, region.height);
    for (let i = 0; i < index.length; i++) {
        if (region.data[i] < 0.5 || index[i] < 0)
            continue;
        out.data.set(LEVEL_TINT[reading.zones[index[i]].level], i * 4);
    }
    return out;
}
// Shade card ---------------------------------------------------------------------------
export const SHADES = [
    ["S01", "Jet black", [14, 1, 1]], ["S02", "Soft black", [18, 2, 3]], ["S03", "Darkest brown", [22, 4, 6]],
    ["S04", "Dark brown", [27, 6, 9]], ["S05", "Medium brown", [33, 8, 13]], ["S06", "Chestnut", [36, 13, 17]],
    ["S07", "Light brown", [42, 9, 18]], ["S08", "Auburn", [35, 20, 22]], ["S09", "Dark blonde", [50, 7, 21]],
    ["S10", "Medium blonde", [58, 6, 24]], ["S11", "Light blonde", [68, 4, 24]], ["S12", "Strawberry blonde", [60, 14, 26]],
    ["S13", "Grey", [58, 0, 2]], ["S14", "Silver", [75, 0, 1]],
];
export const MIX_RATIOS = Array.from({ length: 17 }, (_, k) => Math.round((0.1 + 0.05 * k) * 100) / 100);
export const MIX_ABOVE = 3;
export function shadeLab(id) {
    const row = SHADES.find((s) => s[0] === id);
    if (!row)
        throw new RangeError(`unknown shade ${id}`);
    return [...row[2]];
}
export function hairColour(img, hair) {
    const lab = labPlanes(img), L = [], A = [], B = [];
    for (let i = 0; i < hair.length; i++)
        if (hair[i]) {
            L.push(lab.L[i]);
            A.push(lab.a[i]);
            B.push(lab.b[i]);
        }
    if (L.length < 5)
        throw new RangeError("too few hair pixels to read a colour");
    const lo = quantile(L, 0.2), hi = quantile(L, 0.8);
    let keep = L.map((v, i) => i).filter((i) => L[i] >= lo && L[i] <= hi);
    if (!keep.length)
        keep = L.map((_, i) => i);
    return [quantile(keep.map((i) => L[i]), 0.5), quantile(keep.map((i) => A[i]), 0.5), quantile(keep.map((i) => B[i]), 0.5)];
}
export function linearOf(lab) {
    const rgb = labToRgb(lab);
    return rgb.map((v) => decodeChannel(Math.min(Math.max(v / 255, 0), 1)));
}
export function labOfLinear(lin) {
    return rgbToLab([0, 1, 2].map((c) => encodeChannel(Math.min(Math.max(lin[c], 0), 1)) * 255));
}
export function matchShades(hair, top = 3) {
    const rows = SHADES.map(([id, name, lab]) => ({ id, name, lab: [...lab], delta_e: ciede2000(hair, lab) }));
    rows.sort((x, y) => x.delta_e - y.delta_e || (x.id < y.id ? -1 : 1));
    return rows.slice(0, top);
}
export function bestMix(hair) {
    const lins = SHADES.map((s) => linearOf(s[2]));
    let best = null;
    for (let i = 0; i < SHADES.length; i++)
        for (let j = i + 1; j < SHADES.length; j++)
            for (const t of MIX_RATIOS) {
                const lab = labOfLinear([0, 1, 2].map((c) => (1 - t) * lins[i][c] + t * lins[j][c]));
                const de = ciede2000(hair, lab);
                if (best === null || de < best.delta_e - 1e-12)
                    best = { first: SHADES[i][0], second: SHADES[j][0], second_share: t, lab, delta_e: de };
            }
    return best;
}
export function shadeCard(hair) {
    const top = matchShades(hair);
    return { hair_lab: hair, top, mix: top[0].delta_e > MIX_ABOVE ? bestMix(hair) : null };
}
// Synthetic crown (drawn, with truth) ------------------------------------------------------
export const HAIR = [58, 42, 33], SCALP = [214, 170, 146];
export const OFFSET = 1 << 16, SPIRAL = 3.6, TURNS = 480, ALONG = 2.5;
export function lattice(ix, iy, seed) {
    const x = ix + OFFSET, y = iy + OFFSET;
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 10007) / 10007;
}
export function valueNoise(u, v, seed, period = 0) {
    const u0 = Math.floor(u);
    let v0 = Math.floor(v);
    const fu = u - u0, fv = v - v0, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    let v1 = v0 + 1;
    if (period > 0) {
        v0 = ((v0 % period) + period) % period;
        v1 = ((v1 % period) + period) % period;
    }
    const a = lattice(u0, v0, seed), b = lattice(u0 + 1, v0, seed), c = lattice(u0, v1, seed), d = lattice(u0 + 1, v1, seed);
    return (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + d * su) * sv;
}
export function syntheticCrown({ width = 384, height = 384, seed = 3, hair = HAIR, scalp = SCALP, thin = [0.5, 0.52, 0.24, 0.22], density = [0.35, 0.95] } = {}) {
    if (!(width >= 32 && width <= 4096 && height >= 32 && height <= 4096))
        throw new RangeError("synthetic crown size must be 32..4096");
    const n = width * height, image = byteImage(width, height, 3), scalpOut = new Uint8Array(n), hairOut = new Uint8Array(n);
    const flow = new Float64Array(n), region = floatImage(width, height, 1);
    const wx = 0.5 * width, wy = 0.55 * height, twist = Math.atan(SPIRAL);
    const [cx, cy, rx, ry] = thin;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x, dx = x + 0.5 - wx, dy = y + 0.5 - wy;
            const r = Math.sqrt(dx * dx + dy * dy), phi = Math.atan2(dy, dx);
            flow[i] = phi + twist;
            const strands = valueNoise(r / ALONG, (phi - SPIRAL * Math.log(r)) * (TURNS / (2 * Math.PI)), seed, TURNS);
            const q = ((x + 0.5) / width - cx) ** 2 / rx ** 2 + ((y + 0.5) / height - cy) ** 2 / ry ** 2;
            const share = Math.min(density[1], Math.max(density[0], density[0] + (density[1] - density[0]) * Math.sqrt(q)));
            const isHair = strands < share;
            const shade = valueNoise(x / 3, y / 3, seed + 11) - 0.5, light = 1 + 0.06 * (0.5 - (y + 0.5) / height);
            for (let c = 0; c < 3; c++) {
                const v = (isHair ? hair[c] * (1 + 0.25 * shade) : scalp[c] + 6 * shade) * light;
                image.data[i * 3 + c] = Math.min(255, Math.max(0, roundHalfEven(v)));
            }
            hairOut[i] = isHair ? 1 : 0;
            scalpOut[i] = isHair ? 0 : 1;
            const reg = ((x + 0.5) / width - 0.5) ** 2 / 0.42 ** 2 + ((y + 0.5) / height - 0.52) ** 2 / 0.4 ** 2;
            region.data[i] = reg <= 1 ? 1 : 0;
        }
    return { image, scalp: scalpOut, hair: hairOut, flow, region, thin: [...thin] };
}
export const COVER_LABEL = "Simulation of a topical hair-fibre product. A photo-based estimate, not a diagnosis.";
function refusal(code, reason) { return { rendered: false, code, reason }; }
function identicalBytes(a, b) {
    return a.length === b.length && Array.from(a).every((value, index) => value === b[index]);
}
export class DefaultCoverGuard {
    guard(before, after, lockLevel) {
        const level = coverLevel(lockLevel);
        if (before.length !== after.length)
            throw RangeError("Identity guard requires matching images.");
        let distance = 0;
        for (let i = 0; i < before.length; i++)
            distance += Math.abs(before[i] - after[i]);
        distance /= before.length * 255;
        const similarity = 1 - distance;
        const minimum = .935 + .05 * (level - 1) / 4;
        if (similarity >= minimum)
            return { data: new Uint8Array(after), similarity, blended: false };
        const share = Math.max(0, Math.min(1, (1 - minimum) / Math.max(distance, 1e-12)));
        const data = new Uint8Array(before.length);
        let retainedDifference = 0;
        for (let i = 0; i < before.length; i++) {
            data[i] = Math.min(255, Math.max(0, Math.round(before[i] * (1 - share) + after[i] * share)));
            retainedDifference += Math.abs(before[i] - data[i]);
        }
        return { data, similarity: 1 - retainedDifference / (before.length * 255), blended: true };
    }
}
export class CoverSession {
    plans = new Map();
    zoneGridCalls = 0;
    splitCalls = 0;
    energyCalls = 0;
    clear() { this.plans.clear(); }
    prepare(img, region, scalp, zone, photoHash, selected) {
        const n = img.width * img.height;
        const support = new Uint8Array(n), show = new Uint8Array(n);
        let total = 0, visible = 0, observed = 0;
        const pixelKeys = [];
        for (let i = 0; i < n; i++) {
            support[i] = region.data[i] >= .5 ? 1 : 0;
            show[i] = scalp.data[i] >= .5 && support[i] ? 1 : 0;
            if (support[i])
                total++;
            if (show[i])
                visible++;
            if (support[i] && !show[i]) {
                observed++;
                pixelKeys.push(i);
            }
        }
        if (!total)
            return refusal("empty_region", "Mark a hair region first.");
        if (total < 16)
            return refusal("degenerate_mask", "The marked hair region is too small.");
        if (!visible)
            return refusal("no_scalp", "Mark visible scalp within the hair region.");
        if (observed < 8 && !selected)
            return refusal("no_hair_reference", "Choose a colour or mark existing hair.");
        // Exact content comparison avoids cache reuse after a mask or photo revision.
        const key = photoHash + ":" + zone + ":" + (selected?.join(",") ?? "measured");
        const old = this.plans.get(key);
        if (old && identicalBytes(old.support, support) && identicalBytes(old.sourceScalp, show)) {
            this.plans.delete(key);
            this.plans.set(key, old);
            return old;
        }
        try {
            const grid = gridFor(region);
            this.zoneGridCalls++;
            split(img, region);
            this.splitCalls++;
            const energy = strandEnergy(img);
            this.energyCalls++;
            const sourceScalp = new Uint8Array(show);
            const indices = zoneIndex(grid, img.width, img.height);
            for (let i = 0; i < n; i++) {
                if (zone === "crown" ? indices[i] !== 4 && indices[i] !== 5 :
                    zone === "parting" ? indices[i] !== 1 && indices[i] !== 3 :
                        indices[i] < 0 || indices[i] > 2)
                    show[i] = 0;
            }
            if (!show.some((v) => v === 1))
                return refusal("no_scalp", "No visible scalp in the selected zone.");
            const sorted = Array.from(energy).filter((_, i) => support[i]).sort((a, b) => a - b);
            const position = .95 * (sorted.length - 1), lo = Math.floor(position), hi = Math.ceil(position);
            const percentile = sorted[lo] * (hi - position) + sorted[hi] * (position - lo) || sorted[lo];
            const cap = Math.max(percentile, 1e-7);
            const texture = new Float64Array(n);
            for (let i = 0; i < n; i++)
                texture[i] = Math.max(.90, Math.min(1, .90 + .10 * energy[i] / cap));
            let colour;
            if (selected)
                colour = selected;
            else {
                const med = [0, 1, 2].map((channel) => {
                    const samples = pixelKeys.map((i) => img.data[i * img.channels + channel]).sort((a, b) => a - b);
                    const mid = Math.floor(samples.length / 2);
                    return Math.floor((samples[mid] + samples[Math.floor((samples.length - 1) / 2)]) / 2 + .5);
                });
                colour = [med[0], med[1], med[2]];
            }
            const plan = { key, support, sourceScalp, scalp: show, texture, colour,
                share: show.reduce((sum, v) => sum + v, 0) / total };
            this.plans.delete(key);
            this.plans.set(key, plan);
            while (this.plans.size > 4)
                this.plans.delete(this.plans.keys().next().value);
            return plan;
        }
        catch (err) {
            if (err instanceof RangeError || err instanceof Error) {
                return refusal("degenerate_mask", "Unable to read the marked scalp region.");
            }
            throw err;
        }
    }
    render(img, hairRegion, scalpShow, options) {
        const level = coverLevel(options.level);
        const lockLevel = coverLevel(options.lockLevel ?? 5);
        if (options.phase && !["moving", "release"].includes(options.phase))
            throw RangeError("Unknown preview phase.");
        if (!options.landmarks)
            return refusal("no_mesh", "Primary-face landmarks are required.");
        try {
            validateAnchors(options.landmarks);
        }
        catch {
            return refusal("no_mesh", "Invalid primary-face landmarks.");
        }
        if (!/^[0-9a-f]{64}$/.test(options.photoHash))
            throw RangeError("Photo hash must be a SHA-256 hex string.");
        if (!["crown", "parting", "hairline"].includes(options.zone))
            throw RangeError("Invalid cover zone.");
        if (!Number.isInteger(img.width) || !Number.isInteger(img.height) || img.width < 8 || img.height < 8 ||
            img.width * img.height > 4_500_000 || (img.channels !== 3 && img.channels !== 4) ||
            img.data.length !== img.width * img.height * img.channels)
            return refusal("invalid_image", "Invalid photo.");
        if (hairRegion.width !== img.width || hairRegion.height !== img.height || scalpShow.width !== img.width ||
            scalpShow.height !== img.height || hairRegion.data.length !== img.width * img.height ||
            scalpShow.data.length !== img.width * img.height)
            return refusal("degenerate_mask", "Mask size mismatch.");
        const box = options.primaryBox ?? [0, 0, img.width, img.height];
        if (box.some((v) => !Number.isInteger(v)) || box[0] < 0 || box[1] < 0 ||
            box[2] > img.width || box[3] > img.height || box[0] >= box[2] || box[1] >= box[3]) {
            return refusal("degenerate_mask", "Invalid primary-face box.");
        }
        const selected = options.paletteRgb;
        if (selected && (selected.length !== 3 || selected.some((v) => !Number.isInteger(v) || v < 0 || v > 255))) {
            throw RangeError("Invalid hair pigment RGB.");
        }
        const region = new Float64Array(img.width * img.height), scalp = new Float64Array(region.length);
        for (let y = 0; y < img.height; y++)
            for (let x = 0; x < img.width; x++) {
                const i = y * img.width + x, inside = x >= box[0] && x < box[2] && y >= box[1] && y < box[3];
                if (inside && hairRegion.data[i] >= .5)
                    region[i] = 1;
                if (inside && region[i] && scalpShow.data[i] >= .5)
                    scalp[i] = 1;
            }
        const mask = (data) => ({ width: img.width, height: img.height, channels: 1, data });
        const prepared = this.prepare(img, mask(region), mask(scalp), options.zone, options.photoHash, selected);
        if (!('key' in prepared))
            return prepared;
        const data = new Uint8Array(img.data), coverage = cutForLevel(level);
        let covered = 0;
        for (let pixel = 0; pixel < prepared.scalp.length; pixel++) {
            if (!prepared.scalp[pixel])
                continue;
            covered += coverage * prepared.texture[pixel];
            for (let channel = 0; channel < 3; channel++) {
                const k = pixel * img.channels + channel, weight = coverage * prepared.texture[pixel];
                data[k] = Math.floor(img.data[k] * (1 - weight) + prepared.colour[channel] * weight + .5);
            }
        }
        const before = new Uint8Array(img.data);
        const decision = (options.guard ?? new DefaultCoverGuard()).guard(before, data, lockLevel);
        if (decision.data.length !== before.length || !Number.isFinite(decision.similarity) ||
            decision.similarity < 0 || decision.similarity > 1)
            throw RangeError("Identity guard rejected the preview.");
        const output = new Uint8Array(before);
        let changedPixels = 0;
        for (let i = 0; i < prepared.scalp.length; i++) {
            if (!prepared.scalp[i])
                continue;
            for (let c = 0; c < 3; c++)
                output[i * img.channels + c] = decision.data[i * img.channels + c];
            if ([0, 1, 2].some((c) => before[i * img.channels + c] !== output[i * img.channels + c]))
                changedPixels++;
        }
        const eligible = prepared.scalp.reduce((sum, v) => sum + v, 0);
        let shown = output, previewWidth = img.width, previewHeight = img.height;
        if (options.phase === "moving" && Math.max(img.width, img.height) > 256) {
            const ratio = 256 / Math.max(img.width, img.height);
            previewWidth = Math.max(1, Math.round(img.width * ratio));
            previewHeight = Math.max(1, Math.round(img.height * ratio));
            shown = new Uint8Array(previewWidth * previewHeight * img.channels);
            for (let y = 0; y < previewHeight; y++)
                for (let x = 0; x < previewWidth; x++) {
                    const sy = Math.min(img.height - 1, Math.floor(y * img.height / previewHeight));
                    const sx = Math.min(img.width - 1, Math.floor(x * img.width / previewWidth));
                    const from = (sy * img.width + sx) * img.channels;
                    shown.set(output.subarray(from, from + img.channels), (y * previewWidth + x) * img.channels);
                }
        }
        return { rendered: true, image: { width: previewWidth, height: previewHeight, channels: img.channels, data: shown },
            level, zone: options.zone, beforeShare: prepared.share,
            afterShare: prepared.share * (1 - (eligible ? covered / eligible : 0)), changedPixels,
            identitySimilarity: decision.similarity, identityBlended: decision.blended,
            hairRgb: prepared.colour, providerCalls: 0, simulated: true, label: COVER_LABEL };
    }
}
//# sourceMappingURL=fibre.js.map