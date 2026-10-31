/** Predeclared real-face gate schema; no real-face photos processed by tests.
 * Tests here assess contracts and synthetic data only. Author: John Khan.
 */
import { checkedImage, checkedMasks, supportMask } from './geometry.js';
import { FEATURE_SPECS, specFor } from './specs.js';
export const PASS_DEFINITIONS = FEATURE_SPECS.map(spec => ({
    id: spec.id,
    feature_name: spec.name,
    target_regions: spec.regions,
    should_change: spec.promise,
    must_not_change: 'Pixels outside authorized supplied masks; alpha; image geometry; ' +
        'source buffers; private photo transmission. ' + spec.nonPromise,
    outside_mask_changed_limit: 0,
    max_rgb_channel_delta: spec.maxChannelDelta,
    max_alpha_changed: 0,
    provider_call_limit: 0,
    claimed_scope: spec.reason,
    real_face_status: 'UNPROVEN; requires preregistered frozen real-face gate',
}));
export function evaluateFrame(featureId, before, after, width, height, masks, evidence, requireEffect = true) {
    const spec = specFor(featureId);
    const shape = checkedImage(before, width, height);
    checkedImage(after, width, height);
    if (before.length !== after.length)
        throw new Error('Reference and output shapes differ');
    const approved = checkedMasks(masks, shape, spec);
    const support = supportMask(approved, shape, spec);
    const failures = [];
    let changed = 0, outside = 0, maximum = 0, alpha = 0, supportPixels = 0;
    for (let p = 0; p < width * height; p++) {
        if (support[p])
            supportPixels++;
        let touched = false;
        for (let c = 0; c < 3; c++) {
            const offset = p * shape.channels + c;
            const diff = Math.abs(after[offset] - before[offset]);
            if (diff > 0)
                touched = true;
            if (diff > maximum)
                maximum = diff;
        }
        if (touched) {
            changed++;
            if (support[p] === 0)
                outside++;
        }
        if (shape.channels === 4 && before[p * shape.channels + 3] !== after[p * shape.channels + 3])
            alpha++;
    }
    if (outside > 0)
        failures.push('OUTSIDE_MASK_EDIT');
    if (maximum > spec.maxChannelDelta)
        failures.push('CHANNEL_DELTA_EXCEEDED');
    if (alpha > 0)
        failures.push('ALPHA_MODIFIED');
    if (requireEffect && changed === 0)
        failures.push('NO_VISIBLE_EFFECT');
    if (evidence) {
        if (evidence.provider_calls > 0)
            failures.push('UNEXPECTED_PROVIDER_USE');
        if (evidence.outside_mask_changed !== outside || evidence.changed_pixels !== changed) {
            failures.push('EVIDENCE_MISMATCH');
        }
        if (!evidence.simulated)
            failures.push('SIMULATION_DISCLOSURE_MISSING');
    }
    return { feature_id: featureId, accepted: failures.length === 0, failures,
        support_pixels: supportPixels, changed_pixels: changed, outside_changed: outside,
        max_channel_delta: maximum, alpha_changed: alpha, status: 'SYNTHETIC_ONLY' };
}
