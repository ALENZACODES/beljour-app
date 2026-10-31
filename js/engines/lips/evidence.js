function gray(p, i) { return .2126 * p[i * 4] + .7152 * p[i * 4 + 1] + .0722 * p[i * 4 + 2]; }
function edgeEnergy(p, w, h, mask) {
    let sum = 0, n = 0;
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (mask[i] <= .5)
                continue;
            const gx = (gray(p, i + 1) - gray(p, i - 1)) * .5, gy = (gray(p, i + w) - gray(p, i - w)) * .5;
            sum += Math.hypot(gx, gy);
            n++;
        }
    return n ? sum / n : 0;
}
export function measureLipEvidence(feature, before, after, w, h, mask, zero) {
    if (before.length !== after.length || mask.length !== w * h)
        throw new Error("length mismatch");
    let changed = 0, outChanged = 0, outN = 0, alpha = true;
    for (let i = 0; i < mask.length; i++) {
        const c = before[i * 4] !== after[i * 4] || before[i * 4 + 1] !== after[i * 4 + 1] || before[i * 4 + 2] !== after[i * 4 + 2];
        if (c)
            changed++;
        if (mask[i] <= .01) {
            outN++;
            if (c)
                outChanged++;
        }
        if (before[i * 4 + 3] !== after[i * 4 + 3])
            alpha = false;
    }
    const b = edgeEnergy(before, w, h, mask), a = edgeEnergy(after, w, h, mask), ratio = a / Math.max(b, 1e-6), identity = !zero || before.every((v, i) => v === zero[i]), outside = outN ? outChanged / outN : 0, reasons = [];
    if (outside > .005)
        reasons.push("outside-lip change exceeded tolerance");
    if (!alpha)
        reasons.push("alpha changed");
    if (ratio < .45 || ratio > 1.8)
        reasons.push("lip edge energy changed excessively");
    if (!identity)
        reasons.push("zero-strength output was not exact identity");
    return { feature, changedFraction: changed / mask.length, outsideFraction: outside, alphaPreserved: alpha, edgeEnergyRatio: ratio, identityAtZero: identity, passed: !reasons.length, reasons };
}
export function aggregateLipEvidence(rows) { const passed = rows.filter(r => r.passed).length; return { tested: rows.length, passed, failed: rows.length - passed, passRate: rows.length ? passed / rows.length : null, releaseReady: rows.length > 0 && passed === rows.length }; }
