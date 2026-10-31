export const LEVEL_SD = { normal: 0.5, extra: 1.0, hyper: 1.5 };
export function levelFor(uiSlider) {
    if (!(Number.isFinite(uiSlider) && uiSlider >= -100 && uiSlider <= 100))
        throw new RangeError("Appearance direction must be -100 to 100.");
    const a = Math.abs(uiSlider), direction = Math.sign(uiSlider);
    if (a === 0)
        return { level: "original", sd: 0, direction: 0 };
    if (a === 33)
        return { level: "normal", sd: LEVEL_SD.normal, direction };
    if (a === 66)
        return { level: "extra", sd: LEVEL_SD.extra, direction };
    if (a === 100)
        return { level: "hyper", sd: LEVEL_SD.hyper, direction };
    return { level: "custom", sd: a / 66, direction }; // linear: 33 -> 0.5, 66 -> 1.0, 100 -> 1.52
}
/** First guess at the engine request for a target in SD units (refined by the loop). */
/** @deprecated kept for callers of the earlier API; closedLoop now drives x directly. */
export function initialRequest(sd) {
    return sd <= 1 ? { slider: Math.max(5, Math.round(100 * sd)), gain: 1 } : { slider: 100, gain: Math.min(2.4, sd) };
}
/**
 * Progress along the axis: sum_i (a_i · r_i/|r_i|) / sum_i |r_i| over landmarks the reference moves,
 * a = achieved displacement, r = reference (Extra) displacement. 1.0 = Extra by definition.
 */
export function axisProgress(face, achieved, reference) {
    let maxR = 0;
    for (let i = 0; i < face.length; i++)
        maxR = Math.max(maxR, Math.hypot(reference[i][0] - face[i][0], reference[i][1] - face[i][1]));
    if (!(maxR > 1e-6))
        return 0;
    let num = 0, den = 0;
    for (let i = 0; i < face.length; i++) {
        const rx = reference[i][0] - face[i][0], ry = reference[i][1] - face[i][1], r = Math.hypot(rx, ry);
        if (r < 0.05 * maxR)
            continue;
        num += ((achieved[i][0] - face[i][0]) * rx + (achieved[i][1] - face[i][1]) * ry) / r;
        den += r;
    }
    return den > 0 ? num / den : 0;
}
/**
 * Closed loop: request -> regularised targets -> measure progress -> one proportional correction.
 * `targets(slider, gain)` must return the regularised target mesh (genderTargets(...).points).
 */
export function closedLoop(face, uiSlider, strength, targets) {
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 100))
        throw new RangeError("strength must be 0..100");
    const { sd, direction } = levelFor(uiSlider), target = sd * strength / 100;
    if (direction === 0 || target === 0)
        return { points: face.map((p) => p), slider: 0, gain: 1, target: 0, progress: 0, iterations: 0, reachedTarget: true };
    const reference = targets(100 * direction, 1);
    // Drive x: x <= 1 -> slider 100x, gain 1; x > 1 -> slider 100, gain x. Response is close to a power law
    // (bands() interpolation + regularisers), so update x multiplicatively with a fitted exponent.
    const toReq = (x) => (x <= 1 ? { slider: Math.max(3, Math.round(100 * x)), gain: 1 } : { slider: 100, gain: Math.min(2.4, x) });
    let x = target, req = toReq(x), pts = targets(direction * req.slider, req.gain), p = axisProgress(face, pts, reference), it = 1;
    let prevX = NaN, prevP = NaN;
    for (; it < 5 && Math.abs(p - target) > 0.06 * target && p > 1e-3; it++) {
        let k = 1;
        if (Number.isFinite(prevX) && prevX !== x && prevP > 0 && p !== prevP)
            k = Math.min(3, Math.max(0.25, Math.log(p / prevP) / Math.log(x / prevX)));
        prevX = x;
        prevP = p;
        x = Math.min(2.4, Math.max(0.03, x * Math.pow(target / p, 1 / k)));
        req = toReq(x);
        pts = targets(direction * req.slider, req.gain);
        p = axisProgress(face, pts, reference);
    }
    return { points: pts, slider: direction * req.slider, gain: req.gain, target, progress: p, iterations: it, reachedTarget: Math.abs(p - target) <= 0.1 * target };
}
/** Test-time spacing check from the brief: share of face-box pixels whose max |ΔRGB| > 12 between two renders. */
export function stopSeparation(a, b, box, threshold = 12) {
    let changed = 0, total = 0;
    for (let y = box.y0; y <= box.y1; y++)
        for (let x = box.x0; x <= box.x1; x++) {
            const i = (y * a.width + x) * a.channels, j = (y * a.width + x) * b.channels;
            total++;
            if (Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2])) > threshold)
                changed++;
        }
    return total ? changed / total : 0;
}
