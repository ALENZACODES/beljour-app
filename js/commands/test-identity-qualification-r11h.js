/** Browser contract tests for the private-pair aggregate viewer.
 * Test data is invented rate/count metadata, never images or embeddings.
 * Author: John Khan.
 */
import { parseIdentityQualification, parseIdentityQualificationJson, QualificationInputError, summarizeIdentityQualification, } from './identity-qualification.js';
function ensure(condition, message) {
    if (!condition)
        throw new Error(`Identity aggregate contract: ${message}`);
}
function copy(value) {
    return structuredClone(value);
}
function interval(success, count) {
    return {
        numerator: success,
        denominator: count,
        measured: count === 0 ? null : success / count,
        lower95: count === 0 ? null : Math.max(0, success / count - 0.05),
        upper95: count === 0 ? null : Math.min(1, success / count + 0.05),
    };
}
function metric(genuine = 80, impostor = 80) {
    return {
        genuine,
        impostor,
        true_accept: interval(genuine, genuine),
        false_accept: interval(0, impostor),
    };
}
function fixture() {
    const dimensions = ['source', 'tone', 'gender', 'yaw', 'occlusion', 'image_size'];
    return {
        version: 'beljour-identity-pair-qualification/1',
        status: 'ready_for_independent_review',
        reasons: [],
        policy_sha256: 'a'.repeat(64),
        all_pairs: metric(),
        slices: dimensions.flatMap((dimension) => ['A', 'B'].map((label) => ({
            dimension,
            label,
            metric: metric(40, 40),
            sufficiently_sampled: true,
        }))),
        worst_true_accept_gap: 0,
        measured_on_external_faces: true,
        independently_approved: false,
        release_qualified: false,
    };
}
function refuses(input) {
    try {
        parseIdentityQualification(input);
    }
    catch (error) {
        ensure(error instanceof QualificationInputError, 'malformed aggregate throws only the typed input refusal');
        return;
    }
    throw new Error('Invalid identity qualification accepted');
}
function refusesJson(input) {
    try {
        parseIdentityQualificationJson(input);
    }
    catch (error) {
        ensure(error instanceof QualificationInputError, 'damaged serialized aggregate has a typed input refusal');
        return;
    }
    throw new Error('Damaged JSON aggregate accepted');
}
export function testIdentityQualificationR11H() {
    let checks = 0;
    const original = fixture();
    const parsed = parseIdentityQualification(original);
    ensure(parsed.status === 'ready_for_independent_review', 'valid readiness status is retained');
    ensure(parsed.release_qualified === false && parsed.independently_approved === false, 'an aggregate never makes a release claim');
    ensure(parsed.slices.length === 12, 'all external demographic intersections are visible');
    checks += 3;
    const fromJson = parseIdentityQualificationJson(JSON.stringify(original));
    ensure(JSON.stringify(fromJson) === JSON.stringify(parsed), 'JSON has the same strict schema');
    const summary = summarizeIdentityQualification(fromJson);
    ensure(summary.product === 'BELJOUR', 'public presentation follows the approved brand');
    ensure(summary.independentReleaseRequired, 'independent release approval remains mandatory');
    ensure(summary.outcome.includes('not approved'), 'readiness is not public-release approval');
    ensure(summary.comparisons.includes('80 genuine') && summary.comparisons.includes('80 impostor'), 'true comparison denominators are shown');
    ensure(summary.uncertainty.includes('false acceptance 0.00%'), 'summary names the false-acceptance metric');
    checks += 6;
    const blocked = copy(original);
    blocked.status = 'blocked';
    blocked.reasons = ['identity_regression_detected'];
    const blockedSummary = summarizeIdentityQualification(parseIdentityQualification(blocked));
    ensure(blockedSummary.outcome === 'Qualification blocked', 'blocked status visible');
    ensure(blockedSummary.problems[0] === 'identity_regression_detected', 'blocker reason preserved without person records');
    checks += 2;
    const unproven = copy(original);
    unproven.status = 'unproven';
    unproven.measured_on_external_faces = false;
    unproven.reasons = ['frozen_slice_underpowered'];
    ensure(summarizeIdentityQualification(parseIdentityQualification(unproven)).outcome ===
        'Evidence incomplete', 'missing observations not promoted');
    checks++;
    for (const field of ['photo', 'filename', 'embedding', 'subject', 'face_data', 'pixels']) {
        const changed = copy(original);
        changed[field] = 'private';
        refuses(changed);
        checks++;
    }
    for (const field of ['version', 'status', 'reasons', 'policy_sha256', 'all_pairs',
        'slices', 'worst_true_accept_gap', 'measured_on_external_faces',
        'independently_approved', 'release_qualified']) {
        const changed = copy(original);
        delete changed[field];
        refuses(changed);
        checks++;
    }
    for (const bad of [true, null, [], 0, 'string', { value: original }]) {
        refuses(bad);
        checks++;
    }
    for (const bad of [
        'wrong', 'a'.repeat(63), 'A'.repeat(64), 'z'.repeat(64), '', 123,
    ]) {
        const changed = copy(original);
        changed.policy_sha256 = bad;
        refuses(changed);
        checks++;
    }
    for (const bad of ['PASS', 'approved', '', 123, true]) {
        const changed = copy(original);
        changed.status = bad;
        refuses(changed);
        checks++;
    }
    for (const field of ['release_qualified', 'independently_approved']) {
        for (const bad of [true, null, 0, 'false', undefined]) {
            const changed = copy(original);
            changed[field] = bad;
            refuses(changed);
            checks++;
        }
    }
    for (const reason of ['failed', 'group_gap', '123bad', 'path/private',
        'contains email@example.test', 13, null]) {
        const changed = copy(blocked);
        changed.reasons = [reason];
        if (reason === 'failed' || reason === 'group_gap') {
            parseIdentityQualification(changed);
        }
        else {
            refuses(changed);
        }
        checks++;
    }
    for (const bad of ['NaN', true, -0.1, 1.01, Infinity, -Infinity, undefined]) {
        const changed = copy(original);
        changed.worst_true_accept_gap = bad;
        refuses(changed);
        checks++;
    }
    const notExternal = copy(original);
    notExternal.measured_on_external_faces = false;
    refuses(notExternal);
    const withReasons = copy(original);
    withReasons.reasons = ['missing_group'];
    refuses(withReasons);
    checks += 2;
    const sampleSlices = original.slices;
    for (const broken of [
        { ...sampleSlices[0], label: '../photo' },
        { ...sampleSlices[0], label: '' },
        { ...sampleSlices[0], dimension: 'inferred_trait' },
        { ...sampleSlices[0], sufficiently_sampled: 'true' },
        { ...sampleSlices[0], filename: 'private.png' },
    ]) {
        const changed = copy(original);
        changed.slices = [broken, ...sampleSlices.slice(1)];
        refuses(changed);
        checks++;
    }
    const duplicated = copy(original);
    duplicated.slices = [...sampleSlices, sampleSlices[0]];
    refuses(duplicated);
    checks++;
    for (const bad of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, true, '80']) {
        const changed = copy(original);
        const all = copy(changed.all_pairs);
        all.genuine = bad;
        changed.all_pairs = all;
        refuses(changed);
        checks++;
    }
    const wrongGroupCount = copy(original);
    const wrongSlices = wrongGroupCount.slices.map(copy);
    const first = copy(wrongSlices[0]?.metric);
    first.genuine = 81;
    wrongSlices[0] = { ...wrongSlices[0], metric: first };
    wrongGroupCount.slices = wrongSlices;
    refuses(wrongGroupCount);
    checks++;
    for (const bad of [
        { numerator: 40, denominator: 80, measured: 1, lower95: 0.95, upper95: 1 },
        { numerator: 81, denominator: 80, measured: 1, lower95: 0.95, upper95: 1 },
        { numerator: 80, denominator: 80, measured: 1, lower95: 1.01, upper95: 1 },
        { numerator: 80, denominator: 80, measured: null, lower95: 0.95, upper95: 1 },
        { numerator: 80, denominator: 80, measured: 1, lower95: 0.95, upper95: null },
        { numerator: 80, denominator: 80, measured: 1, lower95: 0.95, upper95: 1, raw: 'photo' },
    ]) {
        const changed = copy(original);
        const all = copy(changed.all_pairs);
        all.true_accept = bad;
        changed.all_pairs = all;
        refuses(changed);
        checks++;
    }
    const zero = copy(blocked);
    zero.all_pairs = metric(0, 0);
    zero.slices = [];
    zero.worst_true_accept_gap = null;
    ensure(parseIdentityQualification(zero).all_pairs.genuine === 0, 'zero denominators must carry null uncertainty and no claimed passes');
    checks++;
    const zeroBad = copy(zero);
    const empty = copy(zeroBad.all_pairs.true_accept);
    empty.measured = 0;
    zeroBad.all_pairs = { ...zeroBad.all_pairs, true_accept: empty };
    refuses(zeroBad);
    checks++;
    refusesJson('{malformed');
    refusesJson('x'.repeat(400_001));
    refusesJson(JSON.stringify({ ...original, photo: { raw: 'unsafe' } }));
    checks += 3;
    const originalJson = JSON.stringify(original);
    ensure(originalJson.length < 400_000, 'normal aggregate fits browser resource limit');
    ensure(parseIdentityQualificationJson(originalJson).release_qualified === false, 'serialized aggregate cannot authorize release');
    checks += 2;
    return checks;
}
