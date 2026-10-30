/**
 * Body numbers. Two sources:
 *  1. Numbers the person types (height, weight, tape measured waist and hips). Most reliable.
 *  2. Estimates from one front photo: MediaPipe Pose landmarks plus its person mask, scaled by
 *     the typed height. Each estimate has a low and high value, because one front photo
 *     can't see body depth and clothes add width.
 *
 * Bands: BMI uses the WHO adult categories. Waist to height uses NICE guideline NG246
 * (0.4 to 0.49 healthy, 0.5 to 0.59 increased, 0.6 or more high), meant for adults with a
 * BMI under 35. Waist to hip and shoulder to waist are shown as numbers only, since there
 * are no universal cut offs for them.
 */
export function bmi(weightKg, heightCm) {
    if (!(weightKg > 0) || !(heightCm > 0))
        return null;
    const v = weightKg / (heightCm / 100) ** 2;
    const band = v < 18.5 ? "underweight range" : v < 25 ? "healthy weight range" : v < 30 ? "overweight range" : "obesity range";
    return { value: Math.round(v * 10) / 10, band, source: "WHO adult BMI categories" };
}
export function waistToHeight(waistCm, heightCm, bmiValue) {
    if (!(waistCm > 0) || !(heightCm > 0))
        return null;
    const v = waistCm / heightCm;
    const band = v < 0.4 ? "below the 0.4 to 0.49 range" : v < 0.5 ? "healthy range" : v < 0.6 ? "increased range" : "high range";
    const source = bmiValue !== undefined && bmiValue >= 35
        ? "NICE NG246 bands are meant for BMI under 35, so treat this as a number only"
        : "NICE guideline NG246: keep your waist to less than half your height";
    return { value: Math.round(v * 100) / 100, band, source };
}
export function ratio(a, b) {
    return a > 0 && b > 0 ? Math.round((a / b) * 100) / 100 : null;
}
/** Ramanujan's second approximation of an ellipse perimeter (semi axes a, b). */
export function ellipsePerimeter(a, b) {
    const h = ((a - b) / (a + b)) ** 2;
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}
/** Circumference from a front width, assuming an ellipse with depth = width x depthRatio. */
export function circumference(widthCm, depthRatio) {
    return ellipsePerimeter(widthCm / 2, (widthCm * depthRatio) / 2);
}
export const DEPTH_RATIO = { chest: [0.62, 0.72, 0.82], waist: [0.68, 0.78, 0.88], hips: [0.66, 0.74, 0.82] };
/** Width of the run of mask pixels that contains column `cx` on row `y`. */
export function rowWidth(mask, w, y, cx, threshold = 0.5) {
    const row = Math.round(y) * w;
    let x = Math.round(cx);
    if (mask[row + x] < threshold)
        return 0;
    let left = x, right = x;
    while (left > 0 && mask[row + left - 1] >= threshold)
        left--;
    while (right < w - 1 && mask[row + right + 1] >= threshold)
        right++;
    return right - left + 1;
}
export function verticalExtent(mask, w, h, threshold = 0.5) {
    let top = -1, bottom = -1;
    for (let y = 0; y < h; y++) {
        let any = false;
        for (let x = 0; x < w; x++)
            if (mask[y * w + x] >= threshold) {
                any = true;
                break;
            }
        if (any) {
            if (top < 0)
                top = y;
            bottom = y;
        }
    }
    return top < 0 ? null : [top, bottom];
}
const r1 = (v) => Math.round(v * 10) / 10;
/**
 * Pose landmarks are normalised (0..1); the mask is w x h with values 0..1 for "person".
 * Assumptions are listed in the UI: front view, standing straight, arms a little away from
 * the body, fitted clothes.
 */
export function estimateBody(lm, mask, w, h, heightCm) {
    const ext = verticalExtent(mask, w, h);
    if (!ext || lm.length < 33)
        return null;
    const pxHeight = ext[1] - ext[0];
    if (pxHeight < h * 0.5)
        return null;
    const k = heightCm / pxHeight;
    const P = (i) => ({ x: lm[i].x * w, y: lm[i].y * h });
    const ls = P(11), rs = P(12), lh = P(23), rh = P(24), lk = P(25), rk = P(26);
    const shoulderY = (ls.y + rs.y) / 2, hipY = (lh.y + rh.y) / 2, kneeY = (lk.y + rk.y) / 2;
    const cx = (ls.x + rs.x + lh.x + rh.x) / 4;
    const jointSpan = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    const warnings = [];
    // shoulder width: the pose gives joint centres; outer shoulder width is about 1.2 times that
    const sh = jointSpan * 1.2 * k;
    const widthAt = (t) => rowWidth(mask, w, shoulderY + t * (hipY - shoulderY), cx);
    const chestPx = widthAt(0.3);
    let waistPx = Infinity;
    for (let t = 0.55; t <= 0.9; t += 0.05)
        waistPx = Math.min(waistPx, widthAt(t) || Infinity);
    let hipPx = 0;
    for (let t = 0; t <= 0.25; t += 0.05)
        hipPx = Math.max(hipPx, rowWidth(mask, w, hipY + t * (kneeY - hipY), cx));
    const armsTouching = chestPx > jointSpan * 1.45;
    if (armsTouching)
        warnings.push("Your arms seem to touch your sides, which widens the chest and waist estimates. Hold them a little away from your body.");
    if (!isFinite(waistPx))
        waistPx = chestPx;
    const circ = (px, kind) => {
        const [lo, mid, hi] = DEPTH_RATIO[kind];
        const width = px * k;
        const spread = armsTouching ? 0.1 : 0.03; // pixel and clothing error
        return [r1(circumference(width, mid)), r1(circumference(width * (1 - spread), lo)), r1(circumference(width * (1 + spread * 0.3), hi))];
    };
    // inseam: crotch sits a little below the hip joints; floor is the bottom of the mask
    const crotchY = hipY + 0.18 * (kneeY - hipY);
    const inseam = (ext[1] - crotchY) * k;
    return {
        cmPerPx: k,
        shoulders: [r1(sh), r1(sh * 0.92), r1(sh * 1.08)],
        chest: circ(chestPx, "chest"),
        waist: circ(waistPx, "waist"),
        hips: circ(hipPx, "hips"),
        inseam: [r1(inseam), r1(inseam * 0.95), r1(inseam * 1.05)],
        armsTouching,
        warnings,
    };
}
/** Level of shoulders, hips and head in a front photo. Small numbers are normal. */
export function posture(lm, w, h) {
    const tilt = (a, b) => {
        const dx = (lm[b].x - lm[a].x) * w, dy = (lm[b].y - lm[a].y) * h;
        let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (deg > 90)
            deg -= 180;
        if (deg < -90)
            deg += 180;
        return Math.round(deg * 10) / 10;
    };
    const describe = (name, deg) => ({
        name, degrees: deg,
        note: Math.abs(deg) < 2 ? "level" : `${Math.abs(deg) < 5 ? "slightly" : "noticeably"} lower on your ${deg > 0 ? "left" : "right"}`,
    });
    return [describe("Shoulders", tilt(12, 11)), describe("Hips", tilt(24, 23)), describe("Head", tilt(8, 7))];
}
//# sourceMappingURL=measure.js.map