const Z95 = 1.959963984540054;
const MIN_GROUP = 20;
const CODES = new Set([
    'no_face', 'multi_face', 'low_confidence', 'out_of_bounds',
    'side_profile', 'head_covering', 'invalid_mesh', 'unreadable',
    'engine_error', 'incomplete', 'threshold_miss',
]);
function count(passed, total) {
    if (!Number.isSafeInteger(passed) || !Number.isSafeInteger(total)
        || passed < 0 || total < 0 || passed > total) {
        throw new RangeError('invalid integer counts');
    }
}
export function wilson95(passed, total) {
    count(passed, total);
    if (!total)
        return null;
    const proportion = passed / total;
    const square = Z95 * Z95;
    const divisor = 1 + square / total;
    const center = (proportion + square / (2 * total)) / divisor;
    const margin = Z95 * Math.sqrt(proportion * (1 - proportion) / total
        + square / (4 * total * total)) / divisor;
    return [passed === 0 ? 0 : Math.max(0, center - margin),
        passed === total ? 1 : Math.min(1, center + margin)];
}
export function classify(passed, total, threshold) {
    const ci95 = wilson95(passed, total);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
        throw new RangeError('invalid written threshold');
    }
    let status = 'UNPROVEN';
    let reason = 'no_observations';
    if (ci95 && total < MIN_GROUP)
        reason = 'small_group';
    else if (ci95 && ci95[0] >= threshold) {
        status = 'PASS';
        reason = 'interval_meets_threshold';
    }
    else if (ci95 && ci95[1] < threshold) {
        status = 'FAIL';
        reason = 'interval_below_threshold';
    }
    else if (ci95)
        reason = 'interval_crosses_threshold';
    return { passed, total, rate: total ? passed / total : null, ci95, threshold, status, reason };
}
function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('diagnostic object is missing');
    }
    return value;
}
function integer(value) {
    if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
        throw new TypeError('expected a nonnegative integer');
    }
    return value;
}
function safeCategory(value) {
    if (typeof value !== 'string' || !value || value.length > 100
        || /[\r\n<>\\:]/.test(value) || value.startsWith('/')
        || value.split('/').some(part => part === '..')
        || /\.(?:png|jpe?g|webp|gif|bmp|tiff?|heic|avif)$/i.test(value)) {
        throw new TypeError('invalid aggregate category');
    }
    return value;
}
function interval(value) {
    const data = record(value);
    const passed = integer(data.passed);
    const total = integer(data.total);
    const threshold = data.threshold;
    if (typeof threshold !== 'number')
        throw new TypeError('missing threshold');
    const derived = classify(passed, total, threshold);
    if (data.rate !== derived.rate || data.status !== derived.status
        || data.reason !== derived.reason)
        throw new TypeError('diagnostic counts do not agree');
    const incoming = data.ci95;
    if (derived.ci95 === null) {
        if (incoming !== null)
            throw new TypeError('missing null confidence interval');
    }
    else if (!Array.isArray(incoming) || incoming.length !== 2
        || incoming.some(value => typeof value !== 'number' || !Number.isFinite(value))
        || derived.ci95.some((number, i) => Math.abs(number - incoming[i]) > 1e-12)) {
        throw new TypeError('tampered confidence interval');
    }
    return derived;
}
export function parseDiagnostic(data) {
    const payload = record(data);
    if (payload.format !== 'beljour-realface-diagnostics/1'
        || payload.confidence !== 0.95 || payload.minimum_slice_faces !== MIN_GROUP) {
        throw new TypeError('unknown or inconsistent diagnostic schema');
    }
    const faceCount = integer(payload.face_count);
    if (!Array.isArray(payload.gates) || payload.gates.length === 0) {
        throw new TypeError('no measured gates');
    }
    const names = new Set();
    const gates = payload.gates.map((raw) => {
        const gate = record(raw);
        const name = safeCategory(gate.gate);
        if (names.has(name))
            throw new TypeError('duplicate gate');
        names.add(name);
        const whole = interval(gate.whole_set);
        if (whole.total !== faceCount)
            throw new TypeError('frozen denominator changed');
        const reasons = {};
        for (const [code, value] of Object.entries(record(gate.failure_reasons))) {
            if (!CODES.has(code))
                throw new TypeError('unrecognized failure reason');
            reasons[code] = integer(value);
        }
        if (Object.values(reasons).reduce((sum, n) => sum + n, 0) !== faceCount - whole.passed) {
            throw new TypeError('failure histogram does not reconcile with gate');
        }
        if (!Array.isArray(gate.slices))
            throw new TypeError('missing slices');
        const seen = new Set();
        const partitions = new Map();
        const slices = gate.slices.map((item) => {
            const slice = record(item);
            const dimension = safeCategory(slice.dimension);
            const value = safeCategory(slice.value);
            const key = `${dimension}:${value}`;
            if (seen.has(key))
                throw new TypeError('duplicate slice');
            seen.add(key);
            const result = interval(slice);
            const partition = partitions.get(dimension) ?? { passed: 0, total: 0 };
            partition.passed += result.passed;
            partition.total += result.total;
            partitions.set(dimension, partition);
            return { dimension, value, ...result };
        });
        if (!partitions.size || [...partitions.values()].some(part => part.passed !== whole.passed || part.total !== faceCount)) {
            throw new TypeError('slice partition does not reconcile with frozen population');
        }
        const status = gate.written_gate_status;
        if (status !== 'PASS' && status !== 'FAIL' && status !== 'UNPROVEN'
            && status !== 'NOT_APPLICABLE')
            throw new TypeError('unknown written gate verdict');
        return { gate: name, whole_set: whole, written_gate_status: status,
            failure_reasons: reasons, slices };
    });
    return { format: 'beljour-realface-diagnostics/1', confidence: 0.95,
        minimum_slice_faces: MIN_GROUP, face_count: faceCount, gates,
        meaning: 'screening intervals; no change to frozen definitions or release verdict' };
}
export function conciseGateLines(data) {
    return data.gates.map(gate => {
        const item = gate.whole_set;
        return `${gate.gate}: ${item.passed}/${item.total}; CI diagnostic ${item.status};`
            + ` frozen gate ${gate.written_gate_status}`;
    });
}
//# sourceMappingURL=realface-summary.js.map