export function measureSmileEvidence(feature, before, after, allowed, annotationValid = true) {
    if (before.length !== after.length || allowed.length * 4 !== before.length)
        throw new Error("length mismatch");
    let changed = 0, out = 0, outN = 0, alpha = true;
    for (let i = 0; i < allowed.length; i++) {
        const c = before[i * 4] !== after[i * 4] || before[i * 4 + 1] !== after[i * 4 + 1] || before[i * 4 + 2] !== after[i * 4 + 2];
        if (c)
            changed++;
        if (allowed[i] < .01) {
            outN++;
            if (c)
                out++;
        }
        if (before[i * 4 + 3] !== after[i * 4 + 3])
            alpha = false;
    }
    const outside = outN ? out / outN : 0, reasons = [];
    if (outside > .005)
        reasons.push("change escaped checked oral region");
    if (!alpha)
        reasons.push("alpha changed");
    if (!annotationValid)
        reasons.push("checked annotation invalid");
    return { feature, tested: true, changedFraction: changed / allowed.length, outsideFraction: outside, alphaPreserved: alpha, annotationValid, passed: !reasons.length, reasons };
}
export function aggregateSmileEvidence(rows) { const tested = rows.filter(r => r.tested), passed = tested.filter(r => r.passed).length; return { tested: tested.length, passed, failed: tested.length - passed, notTested: rows.length - tested.length, passRate: tested.length ? passed / tested.length : null, releaseReady: tested.length > 0 && passed === tested.length && tested.length === rows.length }; }
