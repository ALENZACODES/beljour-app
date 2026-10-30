/** #28 Under-eye brightening for dark circles and eye-bag shadow, matched to her own cheek.
 * Mirrors api/plumb_api/engines/skin/under_eye.py: the median Lab of each under-eye crescent
 * is compared with a patch of cheek below it (the other cheek when that one is hidden); when the crescent is darker, the broad shadow
 * (a local mean that leaves marks and dark outliers out) is moved toward the cheek level, so
 * texture and marks keep their contrast. L* only rises and never past the cheek. Values are
 * ASSUMED, as in Python. Local simulation; general cosmetic information, not medical advice.
 * Author: John Khan.
 */
import { floatImage } from "../core/buffer.js";
import { polygon } from "../core/mask.js";
import { measure } from "./blemish.js";
import * as Z from "./local-zones.js";
export const LABEL = "Under-eye brightening simulation, matched to your own cheek. " + Z.NOT_MEDICAL;
export const CORRECT_MAX = 0.8, DARK_MIN = 2.0, MAX_LIFT = 15.0, BAG_DEPTH = 0.7;
const SHADOW_SHARE = 0.35, OUTLIER_L = 6.0, MIN_ZONE_PIXELS = 12;
export function brightenUnderEyes(image, landmarks, { strength = 60, includeBags = true } = {}) {
    Z.checkPhoto(image, strength);
    if (typeof includeBags !== "boolean")
        throw new RangeError("includeBags must be true or false");
    const pts = Z.meshPoints(landmarks), { width: w, height: h } = image, n = w * h;
    const code = Z.meshRefusal(pts, h, w);
    if (code)
        return Z.unchanged(image, "refused", code, LABEL);
    if (strength === 0)
        return Z.unchanged(image, "not_applicable", "zero_strength", LABEL);
    const frame = Z.faceFrame(pts), skin = Z.skinRegion(pts, h, w);
    let marks = new Uint8Array(n);
    for (const spot of measure(image, pts).spots)
        if (spot.compact)
            for (const i of spot.pixels)
                marks[i] = 1;
    if (marks.some((v) => v))
        marks = Z.dilateBits(marks, w, h, 1);
    const lab = Z.labOf(image), depth = includeBags ? BAG_DEPTH : Z.UNDER_EYE_DEPTH, radius = Z.featherRadius(frame);
    const revised = floatImage(w, h, 3, true), weightAll = new Float64Array(n), sides = {};
    revised.data.set(lab.data);
    const cheeks = {};
    for (const side of Z.SIDES) {
        const cheekArea = polygon(w, h, Z.cheekReferencePolygon(pts, frame, side, depth)), cheek = new Uint8Array(n);
        let count = 0;
        for (let i = 0; i < n; i++) {
            cheek[i] = cheekArea.data[i] >= 0.5 && skin[i] && !marks[i] ? 1 : 0;
            count += cheek[i];
        }
        cheeks[side] = count >= MIN_ZONE_PIXELS ? Z.medianLab(lab, cheek) : null;
    }
    for (const side of Z.SIDES) {
        const source = cheeks[side] !== null ? side : Z.SIDES[1 - Z.SIDES.indexOf(side)];
        const crescent = Z.polygonsMask([Z.underEyePolygon(pts, frame, side, depth)], h, w, skin, radius), core = new Uint8Array(n);
        let coreCount = 0;
        for (let i = 0; i < n; i++) {
            core[i] = crescent.data[i] >= 0.5 && !marks[i] ? 1 : 0;
            coreCount += core[i];
        }
        const row = { zone_pixels: coreCount, cheek_from: source };
        sides[side] = row;
        const ref = cheeks[source];
        if (coreCount < MIN_ZONE_PIXELS || !ref) {
            row.action = "not_visible";
            continue;
        }
        const under = Z.medianLab(lab, core);
        Object.assign(row, { under_eye_lab: under, cheek_lab: ref, difference_l: ref[0] - under[0] });
        if (ref[0] - under[0] < DARK_MIN) {
            row.action = "already_even";
            continue;
        }
        const even = new Uint8Array(n);
        for (let i = 0; i < n; i++)
            even[i] = core[i] && lab.data[i * 3] >= under[0] - OUTLIER_L ? 1 : 0;
        const shadow = Z.localMean(lab, even, Math.max(2, Z.halfUp(SHADOW_SHARE * frame.eyeWidth[side])));
        for (let i = 0; i < n; i++) {
            const weight = (strength / 100) * CORRECT_MAX * crescent.data[i];
            if (!(weight > weightAll[i]))
                continue;
            const lift = Math.min(MAX_LIFT, Math.max(0, ref[0] - shadow.data[i * 3]));
            revised.data[i * 3] = lab.data[i * 3] + weight * lift;
            for (let c = 1; c < 3; c++)
                revised.data[i * 3 + c] = lab.data[i * 3 + c] + weight * (ref[c] - shadow.data[i * 3 + c]);
            weightAll[i] = weight;
        }
        row.action = "brightened";
    }
    const report = { include_bags: includeBags, sides };
    if (Object.values(sides).every((row) => row.action === "not_visible"))
        return Z.unchanged(image, "refused", "zone_not_visible", LABEL, report);
    const moved = new Uint8Array(n);
    let any = false;
    for (let i = 0; i < n; i++)
        if (weightAll[i] > 0) {
            moved[i] = 1;
            any = true;
        }
    if (!any)
        return Z.unchanged(image, "not_applicable", "no_dark_circle", LABEL, report);
    return Z.finish(image, Z.writeLab(image, revised, moved), weightAll, skin, LABEL, report);
}
//# sourceMappingURL=under-eye.js.map