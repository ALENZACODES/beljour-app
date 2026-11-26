/** #26 Blemish and acne healing with tap-to-heal. Mirrors api/plumb_api/engines/skin/blemish.py:
 * spots are connected skin pixels redder or darker than their local surround (size band
 * (IOD/40)^2..(IOD/5)^2); red spots are healed automatically, every other spot is a natural
 * mark (mole, freckle, birthmark) and is kept unless she taps it; keep points keep any spot.
 * Holes are filled crop by crop with the existing fill engine (PatchMatch-lite from nearby
 * skin, fast marching when no whole source patch fits). Thresholds are ASSUMED, as in Python.
 * Local simulation; general cosmetic information, not medical advice.
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { boxMean } from "../core/filters.js";
import { dilate } from "../core/mask.js";
import { fill } from "../fill/fill.js";
import { patchMatch } from "../fill/patchmatch.js";
import { toByte } from "../shade/colourspace.js";
import * as Z from "./local-zones.js";
export const LABEL = "Spot healing simulation. Moles, freckles and other natural marks are kept unless you mark them. " + Z.NOT_MEDICAL;
export const METHODS = ["patchmatch", "fast-marching"];
export const RED_MIN = 4.0, DARK_MIN = 3.0, RED_SHARE = 0.8, TAP_MIN = 3.0;
const BACKGROUND_SHARE = 0.15, EDGE_SHARE = 0.04, TAP_SHARE = 0.08, SPOT_SHARE = 0.03, COMPACT = 0.45;
const PATCH_RADIUS = 2, ITERATIONS = 5, MAX_HEAL_SHARE = 0.08, MAX_POINTS = 64;
function checkPoints(values, name) {
    if (values.length > MAX_POINTS)
        throw new RangeError(`at most ${MAX_POINTS} ${name}`);
    return values.map((p) => {
        if (p.length !== 2)
            throw new RangeError(`${name} must be (x, y) pixel points`);
        const x = Number(p[0]), y = Number(p[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y))
            throw new RangeError(`${name} must be finite`);
        return [x, y];
    });
}
function subtract(a, b) {
    const out = floatImage(a.width, a.height, a.channels, true);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = a.data[i] - b.data[i];
    return out;
}
function candidates(delta, area) {
    const out = new Uint8Array(area.length);
    for (let i = 0; i < area.length; i++)
        out[i] = area[i] && (delta.data[i * 3 + 1] >= RED_MIN || delta.data[i * 3] <= -DARK_MIN) ? 1 : 0;
    return out;
}
/** Spots on the visible skin, sorted into blemishes and natural marks. */
export function measure(image, pts) {
    const { width: w, height: h } = image, frame = Z.faceFrame(pts), iod = frame.iod;
    const skin = Z.skinRegion(pts, h, w), area = Z.erodedSkin(skin, w, h, Math.max(1, EDGE_SHARE * iod));
    const lab = boxMean(Z.labOf(image), 1), radius = Math.max(3, Z.halfUp(BACKGROUND_SHARE * iod));
    const first = Z.localMean(lab, area, radius);
    const firstCand = candidates(subtract(lab, first), area);
    const grown = Z.dilateBits(firstCand, w, h, 1), clean = new Uint8Array(area.length);
    for (let i = 0; i < clean.length; i++)
        clean[i] = area[i] && !grown[i] ? 1 : 0;
    const delta = subtract(lab, Z.localMean(lab, clean, radius, first));
    const red = new Uint8Array(area.length), darker = new Uint8Array(area.length);
    for (let i = 0; i < area.length; i++) {
        red[i] = area[i] && delta.data[i * 3 + 1] >= RED_MIN ? 1 : 0;
        darker[i] = area[i] && !red[i] && delta.data[i * 3] <= -DARK_MIN ? 1 : 0;
    }
    const minArea = Math.max(3, Z.halfUp((iod / 40) ** 2)), maxArea = Math.max(minArea, Z.halfUp((iod / 5) ** 2));
    const spots = [];
    const found = [...Z.components(red, w, h), ...Z.components(darker, w, h)].sort((a, b) => a[0] - b[0]);
    for (const pix of found) {
        if (pix.length < minArea)
            continue;
        let sa = 0, sl = 0, sx = 0, sy = 0, xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
        for (const i of pix)
            sa += delta.data[i * 3 + 1];
        for (const i of pix)
            sl += delta.data[i * 3];
        for (const i of pix) {
            const x = i % w;
            sx += x;
            xa = Math.min(xa, x);
            xb = Math.max(xb, x);
        }
        for (const i of pix) {
            const y = Math.floor(i / w);
            sy += y;
            ya = Math.min(ya, y);
            yb = Math.max(yb, y);
        }
        const meanRed = sa / pix.length, dark = -sl / pix.length, extent = Math.max(xb - xa + 1, yb - ya + 1);
        const blemish = pix.length <= maxArea && meanRed >= RED_MIN && meanRed >= RED_SHARE * Math.max(0, dark);
        spots.push({ pixels: pix, x: sx / pix.length + 0.5, y: sy / pix.length + 0.5, red: meanRed, dark,
            kind: blemish ? "blemish" : "mark", compact: pix.length >= COMPACT * Math.PI * (extent / 2) ** 2 });
    }
    return { skin, area, delta, spots, iod, minArea, maxArea, tapArea: Math.max(maxArea, Z.halfUp((iod / 3) ** 2)) };
}
function near(spot, p, width, radius) {
    let best = Infinity;
    for (const i of spot.pixels)
        best = Math.min(best, (i % width + 0.5 - p[0]) ** 2 + (Math.floor(i / width) + 0.5 - p[1]) ** 2);
    return best <= radius * radius;
}
/** [code, flat pixels] for one tap: a connected differing patch, a small disc, or nothing. */
export function tapPatch(m, tap, h, w) {
    const px = Math.floor(tap[0]), py = Math.floor(tap[1]);
    if (!(px >= 0 && px < w && py >= 0 && py < h) || !m.area[py * w + px])
        return ["outside_skin", []];
    const reach = Math.max(3, TAP_SHARE * m.iod), differs = new Uint8Array(w * h);
    for (let i = 0; i < differs.length; i++) {
        const d0 = m.delta.data[i * 3], d1 = m.delta.data[i * 3 + 1], d2 = m.delta.data[i * 3 + 2];
        differs[i] = m.area[i] && d0 * d0 + d1 * d1 + d2 * d2 >= TAP_MIN * TAP_MIN ? 1 : 0;
    }
    const x0 = Math.max(0, Math.floor(tap[0] - reach)), x1 = Math.min(w - 1, Math.ceil(tap[0] + reach));
    const y0 = Math.max(0, Math.floor(tap[1] - reach)), y1 = Math.min(h - 1, Math.ceil(tap[1] + reach));
    let best = -1, bestD = reach * reach;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            if (!differs[y * w + x])
                continue;
            const d = (x + 0.5 - tap[0]) ** 2 + (y + 0.5 - tap[1]) ** 2;
            if (d <= bestD && (best < 0 || d < bestD)) {
                best = y * w + x;
                bestD = d;
            }
        }
    if (best >= 0) {
        const seen = new Set([best]), queue = [best];
        for (let head = 0; head < queue.length; head++) {
            if (seen.size > m.tapArea)
                return ["too_large", []];
            const i = queue[head], x = i % w, y = Math.floor(i / w);
            for (const [j, ok] of [[i - w, y > 0], [i - 1, x > 0], [i + 1, x < w - 1], [i + w, y < h - 1]]) {
                if (ok && differs[j] && !seen.has(j)) {
                    seen.add(j);
                    queue.push(j);
                }
            }
        }
        if (seen.size > m.tapArea)
            return ["too_large", []];
        return ["healed_mark", [...seen].sort((a, b) => a - b)];
    }
    const r = Math.max(2, SPOT_SHARE * m.iod), disc = [];
    for (let y = Math.max(0, Math.floor(tap[1] - r)); y <= Math.min(h - 1, Math.ceil(tap[1] + r)); y++) {
        for (let x = Math.max(0, Math.floor(tap[0] - r)); x <= Math.min(w - 1, Math.ceil(tap[0] + r)); x++) {
            if (m.area[y * w + x] && (x + 0.5 - tap[0]) ** 2 + (y + 0.5 - tap[1]) ** 2 <= r * r)
                disc.push(y * w + x);
        }
    }
    return disc.length ? ["healed_spot", disc] : ["outside_skin", []];
}
export const growFor = (area) => Math.max(1, Math.min(6, Z.halfUp(0.5 * Math.sqrt(area / Math.PI)) + 1));
function bounds(pixels, w, h, margin) {
    let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
    for (const i of pixels) {
        const x = i % w, y = Math.floor(i / w);
        xa = Math.min(xa, x);
        xb = Math.max(xb, x);
        ya = Math.min(ya, y);
        yb = Math.max(yb, y);
    }
    return [Math.max(0, xa - margin), Math.min(w - 1, xb + margin), Math.max(0, ya - margin), Math.min(h - 1, yb + margin)];
}
function growInto(pixels, grow, h, w, into) {
    const [x0, x1, y0, y1] = bounds(pixels, w, h, grow + 1), cw = x1 - x0 + 1;
    const crop = floatImage(cw, y1 - y0 + 1, 1);
    for (const i of pixels)
        crop.data[(Math.floor(i / w) - y0) * cw + (i % w - x0)] = 1;
    const grown = dilate(crop, grow);
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
            if (grown.data[(y - y0) * cw + (x - x0)] >= 0.5)
                into[y * w + x] = 1;
}
function healCrop(work, pixels, sources, method, seed) {
    const { width: w, height: h, channels: ch } = work;
    const [x0, x1, y0, y1] = bounds(pixels, w, h, 2 * PATCH_RADIUS + 2 + Math.ceil(Math.sqrt(pixels.length)));
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
    const crop = { width: cw, height: chh, channels: ch, data: new Uint8Array(cw * chh * ch) };
    const hole = floatImage(cw, chh, 1), src = floatImage(cw, chh, 1);
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const c = (y - y0) * cw + (x - x0);
            for (let k = 0; k < ch; k++)
                crop.data[c * ch + k] = work.data[(y * w + x) * ch + k];
            src.data[c] = sources[y * w + x];
        }
    for (const i of pixels)
        hole.data[(Math.floor(i / w) - y0) * cw + (i % w - x0)] = 1;
    let used = method, filled = null;
    if (method === "patchmatch") {
        try {
            filled = patchMatch(crop, hole, { patchRadius: PATCH_RADIUS, iterations: ITERATIONS, seed, sourceMask: src }).image;
        }
        catch (error) {
            if (!(error instanceof RangeError) || !/no complete source patch/.test(error.message))
                throw error;
            used = "fast-marching";
        }
    }
    if (!filled)
        filled = fill(crop, hole, "fast-marching").image;
    for (const i of pixels) {
        const c = (Math.floor(i / w) - y0) * cw + (i % w - x0);
        for (let k = 0; k < 3; k++)
            work.data[i * ch + k] = filled.data[c * ch + k];
    }
    return used;
}
/** Heal blemishes (auto) and the spots she taps; keep natural marks and her keep points. */
export function healBlemishes(image, landmarks, { strength = 100, auto = true, taps = [], keep = [], method = "patchmatch", seed = 7 } = {}) {
    Z.checkPhoto(image, strength);
    if (!METHODS.includes(method))
        throw new RangeError(`method must be one of ${METHODS.join(", ")}`);
    if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 31)
        throw new RangeError("seed must be a whole number from 0 to 2^31 - 1");
    const tapPoints = checkPoints(taps, "taps"), keepPoints = checkPoints(keep, "keep points");
    const pts = Z.meshPoints(landmarks), { width: w, height: h } = image, n = w * h;
    const code = Z.meshRefusal(pts, h, w);
    if (code)
        return Z.unchanged(image, "refused", code, LABEL);
    if (strength === 0)
        return Z.unchanged(image, "not_applicable", "zero_strength", LABEL);
    const m = measure(image, pts);
    let areaCount = 0;
    for (const v of m.area)
        areaCount += v;
    if (areaCount < Z.MIN_SKIN_PIXELS)
        return Z.unchanged(image, "refused", "no_skin_visible", LABEL);
    const reach = Math.max(3, TAP_SHARE * m.iod), tapRows = [], tapped = [];
    for (const tap of tapPoints) {
        const [tcode, pix] = tapPatch(m, tap, h, w);
        tapRows.push({ x: tap[0], y: tap[1], code: tcode, pixels: pix.length });
        if (pix.length)
            tapped.push(pix);
    }
    const tappedMask = new Uint8Array(n);
    for (const pix of tapped)
        for (const i of pix)
            tappedMask[i] = 1;
    const seeds = [], rows = [], actions = [];
    let protect = new Uint8Array(n), exclude = new Uint8Array(n);
    for (const spot of m.spots) {
        for (const i of spot.pixels)
            exclude[i] = 1;
        const requested = spot.pixels.some((i) => tappedMask[i]), kept = keepPoints.some((p) => near(spot, p, w, reach));
        let action;
        if (requested)
            action = "healed_by_request";
        else if (kept)
            action = "kept_by_request";
        else if (spot.kind === "blemish" && auto) {
            action = "healed";
            seeds.push(spot.pixels);
        }
        else
            action = "kept";
        if (action.startsWith("kept"))
            for (const i of spot.pixels)
                protect[i] = 1;
        actions.push(action);
        rows.push({ x: spot.x, y: spot.y, area: spot.pixels.length, kind: spot.kind, compact: spot.compact, red: spot.red, dark: spot.dark, action });
    }
    for (const pix of tapped)
        for (const i of pix) {
            exclude[i] = 1;
            protect[i] = 0;
        }
    seeds.push(...tapped);
    if (protect.some((v) => v))
        protect = Z.dilateBits(protect, w, h, 1);
    if (exclude.some((v) => v))
        exclude = Z.dilateBits(exclude, w, h, 1);
    const hole = new Uint8Array(n);
    for (const pix of seeds)
        growInto(pix, growFor(pix.length), h, w, hole);
    for (const pix of tapped)
        for (const i of pix)
            hole[i] = 1;
    let count = 0, skinCount = 0;
    for (let i = 0; i < n; i++) {
        if (protect[i] && !tappedMask[i])
            hole[i] = 0;
        if (!m.skin[i])
            hole[i] = 0;
        count += hole[i];
        skinCount += m.skin[i];
    }
    const report = { spots: rows, taps: tapRows, method,
        healed_spots: actions.filter((a) => a.startsWith("healed")).length,
        kept_marks: actions.filter((a) => a.startsWith("kept")).length, healed_pixels: count };
    if (count === 0)
        return Z.unchanged(image, "not_applicable", "nothing_to_heal", LABEL, report);
    if (count > MAX_HEAL_SHARE * skinCount)
        return Z.unchanged(image, "refused", "identity_guard", LABEL, report);
    const work = Z.copyImage(image), sources = new Uint8Array(n);
    for (let i = 0; i < n; i++)
        sources[i] = m.skin[i] && !exclude[i] && !hole[i] ? 1 : 0;
    report.fills = Z.components(hole, w, h).map((pix, k) => healCrop(work, pix, sources, method, seed + k));
    const s = strength / 100, out = Z.copyImage(image), alpha = new Float64Array(n), ch = image.channels;
    for (let i = 0; i < n; i++) {
        if (!hole[i])
            continue;
        alpha[i] = s;
        for (let k = 0; k < 3; k++) {
            const base = image.data[i * ch + k];
            out.data[i * ch + k] = s === 1 ? work.data[i * ch + k] : toByte(base + s * (work.data[i * ch + k] - base));
        }
    }
    return Z.finish(image, out, alpha, m.skin, LABEL, report);
}
//# sourceMappingURL=blemish.js.map