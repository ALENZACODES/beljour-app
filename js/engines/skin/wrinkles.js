/** #27 Fine-line softening. Mirrors api/plumb_api/engines/skin/wrinkles.py: a Hessian ridge
 * filter on binomially smoothed L* inside landmark zones; line strength max(0, l1 - |l2|)
 * ignores round spots (moles, freckles, pores), and spots found by the blemish measure are
 * protected too. Each line pixel moves at most SOFTEN_MAX of the way toward the nearby
 * non-line skin, never past it: lines are softened, not erased. Values ASSUMED, as in Python.
 * Local simulation; general cosmetic information, not medical advice.
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { convolve } from "../core/filters.js";
import { measure } from "./blemish.js";
import * as Z from "./local-zones.js";
export const LABEL = "Line softening simulation. Lines are softened, not erased. " + Z.NOT_MEDICAL;
export const DEFAULT_ZONES = ["forehead", "glabella", "crow_feet", "nasolabial"];
const SMOOTH = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16], SECOND = [1, -2, 1], CENTRAL = [-0.5, 0, 0.5];
export const SOFTEN_MAX = 0.65, LINE_MIN = 1.0, LINE_FULL = 3.0;
const SURROUND_SHARE = 0.08, MIN_ZONE_PIXELS = 24;
/** max(0, l1 - |l2|) of the Hessian of the binomially smoothed L* plane. */
export function lineStrength(lightness) {
    const smooth = convolve(convolve(lightness, SMOOTH, 0), SMOOTH, 1);
    const lxx = convolve(smooth, SECOND, 1), lyy = convolve(smooth, SECOND, 0);
    const lxy = convolve(convolve(smooth, CENTRAL, 1), CENTRAL, 0), out = new Float64Array(lightness.data.length);
    for (let i = 0; i < out.length; i++) {
        const half = (lxx.data[i] - lyy.data[i]) / 2, root = Math.sqrt(half * half + lxy.data[i] * lxy.data[i]);
        const mid = (lxx.data[i] + lyy.data[i]) / 2;
        out[i] = Math.max(0, mid + root - Math.abs(mid - root));
    }
    return out;
}
export function softenLines(image, landmarks, { strength = 60, zones = DEFAULT_ZONES } = {}) {
    Z.checkPhoto(image, strength);
    const names = Z.checkZones([...zones]), pts = Z.meshPoints(landmarks), { width: w, height: h } = image, n = w * h;
    const code = Z.meshRefusal(pts, h, w);
    if (code)
        return Z.unchanged(image, "refused", code, LABEL);
    if (strength === 0)
        return Z.unchanged(image, "not_applicable", "zero_strength", LABEL);
    const frame = Z.faceFrame(pts), skin = Z.skinRegion(pts, h, w), zone = Z.zoneMask(pts, h, w, names, skin, frame);
    let zoneCount = 0;
    for (const v of zone.data)
        if (v > 0)
            zoneCount++;
    const report = { zones: [...names], zone_pixels: zoneCount };
    if (zoneCount < MIN_ZONE_PIXELS)
        return Z.unchanged(image, "refused", "zone_not_visible", LABEL, report);
    let spots = new Uint8Array(n);
    for (const spot of measure(image, pts).spots)
        if (spot.compact)
            for (const i of spot.pixels)
                spots[i] = 1;
    if (spots.some((v) => v))
        spots = Z.dilateBits(spots, w, h, 1);
    const lab = Z.labOf(image), lightness = floatImage(w, h, 1, true);
    for (let i = 0; i < n; i++)
        lightness.data[i] = lab.data[i * 3];
    const ridge = lineStrength(lightness), ramp = new Float64Array(n), calm = new Uint8Array(n);
    let lines = 0, guarded = 0;
    for (let i = 0; i < n; i++) {
        ramp[i] = spots[i] ? 0 : Math.min(1, Math.max(0, (ridge[i] - LINE_MIN) / (LINE_FULL - LINE_MIN)));
        if (zone.data[i] > 0 && ramp[i] > 0)
            lines++;
        if (zone.data[i] > 0 && spots[i])
            guarded++;
        calm[i] = skin[i] && ramp[i] < 0.5 && !spots[i] ? 1 : 0;
    }
    report.line_pixels = lines;
    report.protected_spot_pixels = guarded;
    if (!lines)
        return Z.unchanged(image, "not_applicable", "no_lines_found", LABEL, report);
    const surround = Z.localMean(lab, calm, Math.max(2, Z.halfUp(SURROUND_SHARE * frame.iod)));
    const weight = new Float64Array(n), moved = new Uint8Array(n), revised = floatImage(w, h, 3, true);
    revised.data.set(lab.data);
    let count = 0;
    for (let i = 0; i < n; i++) {
        const gap = surround.data[i * 3] - lab.data[i * 3];
        if (!(zone.data[i] > 0 && ramp[i] > 0 && gap > 0))
            continue;
        weight[i] = (strength / 100) * SOFTEN_MAX * zone.data[i] * ramp[i];
        if (!(weight[i] > 0))
            continue;
        moved[i] = 1;
        count++;
        for (let c = 0; c < 3; c++)
            revised.data[i * 3 + c] = lab.data[i * 3 + c] + weight[i] * (surround.data[i * 3 + c] - lab.data[i * 3 + c]);
    }
    if (!count)
        return Z.unchanged(image, "not_applicable", "no_lines_found", LABEL, report);
    const out = Z.writeLab(image, revised, moved), after = Z.labOf(out);
    let before = 0, remain = 0;
    for (let i = 0; i < n; i++) {
        if (!moved[i])
            continue;
        before += surround.data[i * 3] - lab.data[i * 3];
        remain += surround.data[i * 3] - after.data[i * 3];
    }
    report.softened_pixels = count;
    report.mean_line_depth_before = before / count;
    report.mean_line_depth_after = remain / count;
    return Z.finish(image, out, weight, skin, LABEL, report);
}
