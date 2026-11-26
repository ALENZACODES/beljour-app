/** Read-only, photo-free BELJOUR identity qualification presentation.
 *
 * The server-side frozen-pair evaluator owns numerical calculations. This
 * module validates an aggregate result before any app-facing presentation.
 * It does not accept biometric vectors, photo paths, source identifiers,
 * identity assertions for individuals, or a claimed release approval.
 * Author: John Khan.
 */
export class QualificationInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QualificationInputError';
    }
}
const VERSION = 'beljour-identity-pair-qualification/1';
const DIGEST = /^[a-f0-9]{64}$/;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9_ .-]{0,47}$/;
const DIMENSIONS = ['source', 'tone', 'gender', 'yaw', 'occlusion', 'image_size'];
const STATUSES = ['blocked', 'unproven', 'ready_for_independent_review'];
const TOP = [
    'version', 'status', 'policy_sha256', 'reasons', 'all_pairs', 'slices',
    'worst_true_accept_gap', 'measured_on_external_faces',
    'independently_approved', 'release_qualified',
];
const METRIC = ['genuine', 'impostor', 'true_accept', 'false_accept'];
const INTERVAL = ['numerator', 'denominator', 'measured', 'lower95', 'upper95'];
const SLICE = ['dimension', 'label', 'metric', 'sufficiently_sampled'];
function refuse(message) {
    throw new QualificationInputError(message);
}
function record(input, keys) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return refuse('Expected an evidence object.');
    }
    const row = input;
    const actual = Object.keys(row).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length ||
        actual.some((key, index) => key !== expected[index])) {
        return refuse('Evidence fields are missing or unexpected.');
    }
    return row;
}
function finiteNumber(input, label, min, max) {
    if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) {
        return refuse(`${label} has an invalid numeric value.`);
    }
    return input;
}
function count(input, label) {
    const number = finiteNumber(input, label, 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(number))
        return refuse(`${label} must be a safe integer.`);
    return number;
}
function flag(input, label) {
    if (typeof input !== 'boolean')
        return refuse(`${label} must be boolean.`);
    return input;
}
function nullableRate(input, label) {
    if (input === null)
        return null;
    return finiteNumber(input, label, 0, 1);
}
function parseInterval(raw) {
    const row = record(raw, INTERVAL);
    const numerator = count(row.numerator, 'numerator');
    const denominator = count(row.denominator, 'denominator');
    if (numerator > denominator)
        return refuse('Interval successes exceed comparisons.');
    const measured = nullableRate(row.measured, 'measured');
    const lower95 = nullableRate(row.lower95, 'lower95');
    const upper95 = nullableRate(row.upper95, 'upper95');
    if (denominator === 0) {
        if (measured !== null || lower95 !== null || upper95 !== null || numerator !== 0) {
            return refuse('Empty intervals must have null measurements and zero successes.');
        }
    }
    else {
        if (measured === null || lower95 === null || upper95 === null) {
            return refuse('Nonempty intervals require three finite measurements.');
        }
        if (Math.abs(measured - numerator / denominator) > 1e-10 ||
            lower95 > measured || upper95 < measured || lower95 > upper95) {
            return refuse('Confidence interval disagrees with its count evidence.');
        }
    }
    return { numerator, denominator, measured, lower95, upper95 };
}
function parseMetric(raw) {
    const row = record(raw, METRIC);
    const genuine = count(row.genuine, 'genuine');
    const impostor = count(row.impostor, 'impostor');
    const trueAccept = parseInterval(row.true_accept);
    const falseAccept = parseInterval(row.false_accept);
    if (trueAccept.denominator !== genuine || falseAccept.denominator !== impostor) {
        return refuse('Metric denominators do not agree with the genuine/impostor counts.');
    }
    return {
        genuine,
        impostor,
        true_accept: trueAccept,
        false_accept: falseAccept,
    };
}
function parseSlice(raw) {
    const row = record(raw, SLICE);
    const dimension = row.dimension;
    const label = row.label;
    if (typeof dimension !== 'string' || !DIMENSIONS.some((item) => item === dimension)) {
        return refuse('Slice dimension is not part of the frozen schema.');
    }
    if (typeof label !== 'string' || !LABEL.test(label)) {
        return refuse('A slice has an invalid label.');
    }
    return {
        dimension,
        label,
        metric: parseMetric(row.metric),
        sufficiently_sampled: flag(row.sufficiently_sampled, 'sufficiently_sampled'),
    };
}
export function parseIdentityQualification(input) {
    const row = record(input, TOP);
    if (row.version !== VERSION)
        return refuse('Unknown identity qualification version.');
    if (typeof row.policy_sha256 !== 'string' || !DIGEST.test(row.policy_sha256)) {
        return refuse('A preregistered policy fingerprint is required.');
    }
    if (typeof row.status !== 'string' || !STATUSES.some((value) => value === row.status)) {
        return refuse('Unknown qualification status.');
    }
    if (row.independently_approved !== false || row.release_qualified !== false) {
        return refuse('An aggregate report cannot authorize real-face release.');
    }
    if (!Array.isArray(row.reasons) || row.reasons.length > 100 ||
        row.reasons.some((reason) => typeof reason !== 'string' || !/^[a-z][a-z_]{0,79}$/.test(reason))) {
        return refuse('Evidence reasons are invalid.');
    }
    if (!Array.isArray(row.slices) || row.slices.length > 256) {
        return refuse('Aggregate slice coverage exceeds the defined limit.');
    }
    const slices = row.slices.map(parseSlice);
    const seen = new Set();
    for (const slice of slices) {
        const key = `${slice.dimension}:${slice.label}`;
        if (seen.has(key))
            return refuse('Aggregate slice is duplicated.');
        seen.add(key);
    }
    const groupGap = row.worst_true_accept_gap === null ? null :
        finiteNumber(row.worst_true_accept_gap, 'worst_true_accept_gap', 0, 1);
    const allPairs = parseMetric(row.all_pairs);
    for (const slice of slices) {
        if (slice.metric.genuine > allPairs.genuine || slice.metric.impostor > allPairs.impostor) {
            return refuse('Slice counts exceed the all-pair comparison counts.');
        }
    }
    if (row.status === 'ready_for_independent_review' &&
        (row.reasons.length > 0 || row.measured_on_external_faces !== true)) {
        return refuse('Readiness requires external, complete observations.');
    }
    return {
        version: VERSION,
        status: row.status,
        policy_sha256: row.policy_sha256,
        reasons: [...row.reasons],
        all_pairs: allPairs,
        slices,
        worst_true_accept_gap: groupGap,
        measured_on_external_faces: flag(row.measured_on_external_faces, 'source_class'),
        independently_approved: false,
        release_qualified: false,
    };
}
export function parseIdentityQualificationJson(json) {
    if (typeof json !== 'string' || json.length > 400_000) {
        return refuse('Aggregate identity report exceeds the browser size limit.');
    }
    let decoded;
    try {
        decoded = JSON.parse(json);
    }
    catch {
        return refuse('Aggregate identity report is not valid JSON.');
    }
    return parseIdentityQualification(decoded);
}
export function summarizeIdentityQualification(report) {
    const result = parseIdentityQualification(report);
    const fractions = result.all_pairs;
    const far = fractions.false_accept.measured;
    const tar = fractions.true_accept.measured;
    const rate = (value) => value === null ? 'not measured' : `${(100 * value).toFixed(2)}%`;
    let outcome = 'Qualification blocked';
    if (result.status === 'unproven')
        outcome = 'Evidence incomplete';
    if (result.status === 'ready_for_independent_review') {
        outcome = 'Ready for independent review, not approved for release';
    }
    return {
        product: 'BELJOUR',
        title: 'Identity preservation qualification',
        outcome,
        comparisons: `${fractions.genuine} genuine and ${fractions.impostor} impostor comparisons`,
        uncertainty: `True acceptance ${rate(tar)}; false acceptance ${rate(far)}. ` +
            'Uncertainty intervals and all labelled groups require review.',
        independentReleaseRequired: true,
        problems: [...result.reasons],
    };
}
//# sourceMappingURL=identity-qualification.js.map