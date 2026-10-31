/** Independent pixel evidence for observed W28/W39 hair-colour simulations.
 * Output remains not tested for real-face quality without external evidence.
 * Author: John Khan.
 */
import { boxBlur } from "./recolour.js";
export const STATUS_NOT_TESTED = "not_tested";
export const MIN_SAMPLES = 16;
function validateFrames(before, after, mask) {
    if (before.width !== after.width || before.height !== after.height ||
        before.channels !== after.channels || (before.channels !== 3 && before.channels !== 4)) {
        throw new RangeError("audit frames must have matching RGB/RGBA shapes");
    }
    const count = before.width * before.height;
    if (before.data.length !== count * before.channels ||
        after.data.length !== before.data.length || mask.length !== count) {
        throw new RangeError("audit data must match the frame sizes");
    }
    for (let i = 0; i < mask.length; i++) {
        if (!(mask[i] >= 0 && mask[i] <= 1)) {
            throw new RangeError("audit requires a finite observed mask in 0..1");
        }
    }
}
export function structureCorrelation(before, after, mask, radius = 3) {
    if (!Number.isInteger(radius) || radius < 1 || radius > 8) {
        throw new RangeError("structure radius must be 1..8");
    }
    const n = before.width * before.height;
    const hair = Float64Array.from(mask, (v) => v >= 0.5 ? 1 : 0);
    const cover = boxBlur(hair, before.width, before.height, radius + 1);
    const light0 = new Float64Array(n);
    const light1 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let src = 0;
        let dst = 0;
        for (const [c, weight] of [[0, 0.2126], [1, 0.7152], [2, 0.0722]]) {
            src += before.data[i * before.channels + c] * weight;
            dst += after.data[i * after.channels + c] * weight;
        }
        light0[i] = src;
        light1[i] = dst;
    }
    const blur0 = boxBlur(light0, before.width, before.height, radius);
    const blur1 = boxBlur(light1, before.width, before.height, radius);
    const x = [];
    const y = [];
    for (let i = 0; i < n; i++) {
        const high = light0[i] - blur0[i];
        if (hair[i] !== 1 || cover[i] < 1 - 1e-9 || Math.abs(high) <= 2)
            continue;
        x.push(high);
        y.push(light1[i] - blur1[i]);
    }
    if (x.length < 3)
        return { correlation: null, samples: x.length };
    const mx = x.reduce((sum, n) => sum + n, 0) / x.length;
    const my = y.reduce((sum, n) => sum + n, 0) / y.length;
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (let i = 0; i < x.length; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        xx += dx * dx;
        xy += dx * dy;
        yy += dy * dy;
    }
    const divisor = Math.sqrt(xx * yy);
    return {
        correlation: divisor < 1e-9 ? null : Math.max(-1, Math.min(1, xy / divisor)),
        samples: x.length,
    };
}
export function auditPixels(before, after, mask, flags) {
    validateFrames(before, after, mask);
    let hair = 0;
    let changed = 0;
    let outsideChanged = 0;
    let alphaChanged = 0;
    let maxOutside = 0;
    let totalDistance = 0;
    for (let pixel = 0; pixel < mask.length; pixel++) {
        const supported = mask[pixel] >= 0.5;
        if (supported)
            hair++;
        let differs = false;
        for (let c = 0; c < 3; c++) {
            const offset = pixel * before.channels + c;
            const difference = Math.abs(before.data[offset] - after.data[offset]);
            differs ||= difference > 0;
            if (supported)
                totalDistance += difference;
            else
                maxOutside = Math.max(maxOutside, difference);
        }
        if (differs && supported)
            changed++;
        if (differs && !supported)
            outsideChanged++;
        if (before.channels === 4 && before.data[pixel * 4 + 3] !== after.data[pixel * 4 + 3]) {
            alphaChanged++;
        }
    }
    if (hair < MIN_SAMPLES)
        throw new RangeError("not enough observed hair to audit");
    const structure = structureCorrelation(before, after, mask);
    return {
        observedPixels: hair,
        changedPixels: changed,
        outsideChangedPixels: outsideChanged,
        alphaChangedPixels: alphaChanged,
        meanRgbDelta: totalDistance / (hair * 3),
        maxOutsideDelta: maxOutside,
        structureCorrelation: structure.correlation,
        structureSamples: structure.samples,
        guardInvoked: flags.guardInvoked,
        simulationDisclosed: flags.simulationDisclosed,
        realfaceStatus: STATUS_NOT_TESTED,
    };
}
export function mergeGroupCounts(rows) {
    const totals = new Map();
    for (const row of rows) {
        if (!["monk", "gender", "age", "hair_texture", "yaw", "intersection"].includes(row.group)) {
            throw new RangeError("unapproved group");
        }
        if (!row.label || row.label.length > 64 || /[\r\n\/\\@]/.test(row.label)) {
            throw new RangeError("invalid aggregate group label");
        }
        const quantities = [
            row.observed, row.evaluated, row.refusals,
            row.leakageFailures, row.unmeasured,
        ];
        if (quantities.some((value) => !Number.isSafeInteger(value) || value < 0)) {
            throw new RangeError("aggregate counts must be nonnegative integers");
        }
        if (row.evaluated + row.refusals + row.unmeasured !== row.observed ||
            row.leakageFailures > row.evaluated) {
            throw new RangeError("aggregate categories are inconsistent");
        }
        const key = `${row.group}\u0000${row.label}`;
        const current = totals.get(key);
        if (!current) {
            totals.set(key, { ...row });
            continue;
        }
        current.observed += row.observed;
        current.evaluated += row.evaluated;
        current.refusals += row.refusals;
        current.leakageFailures += row.leakageFailures;
        current.unmeasured += row.unmeasured;
    }
    return [...totals.values()]
        .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label))
        .map((row) => ({ ...row, qualityStatus: STATUS_NOT_TESTED }));
}
