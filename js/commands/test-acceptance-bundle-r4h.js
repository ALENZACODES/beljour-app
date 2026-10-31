/** Joined quality evidence test; still external-face UNPROVEN.
 * Author: John Khan.
 */
import { assembleBrowserAcceptance } from './acceptance-bundle.js';
import { parseProCommands, userIdentityOverride } from './plan.js';
import { ProRenderError } from './runtime.js';
function check(value, label) {
    if (!value)
        throw new Error(`bundle ${label}`);
}
function sample(quality, colour = 40, verified = true) {
    const pixels = new Uint8Array(8 * 8 * 4);
    for (let pixel = 0; pixel < 64; pixel++) {
        pixels.set([colour, colour, colour, 255], pixel * 4);
    }
    return {
        image: { width: 8, height: 8, channels: 4, pixels },
        steps: [{
                index: 0, command: 'cleanup', level: '3.0', changed: true, cacheHit: false,
                identity: verified ? { identityMatch: 98, status: 'kept', syntheticOnly: true } : null,
            }],
        quality, elapsedMs: 3, targetMs: quality === 'preview' ? 100 : 2000,
        withinBudget: true, originalUnchanged: true,
    };
}
function expects(code, fn) {
    try {
        fn();
    }
    catch (error) {
        check(error instanceof ProRenderError && error.code === code, `expected ${code}`);
        return;
    }
    throw new Error(`expected ${code}`);
}
export function testAcceptanceBundleR4H() {
    let count = 0;
    const plan = parseProCommands('/cleanup 3.0');
    const bundle = assembleBrowserAcceptance(plan, sample('preview'), sample('export'));
    check(bundle.status === 'unproven', 'incomplete local evidence is unproven');
    check(bundle.outstandingEvidence.includes('external_realface_gate_and_human_review'), 'independent review mandatory');
    check(bundle.outstandingEvidence.includes('checked_region_coverage'), 'mask evidence missing');
    check(bundle.releaseQualified === false, 'no public release');
    count += 4;
    const unguarded = assembleBrowserAcceptance(plan, sample('preview', 40, false), sample('export', 40, false));
    check(unguarded.status === 'blocked' &&
        unguarded.blockingReasons.includes('step_identity_unverified'), 'missing lock blocks');
    count++;
    const opted = parseProCommands('/cleanup 3.0', userIdentityOverride(false));
    const weakened = assembleBrowserAcceptance(opted, sample('preview'), sample('export'));
    check(weakened.blockingReasons.includes('identity_user_optout'), 'user opt-out not release-safe');
    count++;
    const drift = assembleBrowserAcceptance(plan, sample('preview', 40), sample('export', 200));
    check(drift.status === 'review' &&
        drift.outstandingEvidence.includes('preview_export_drift_review'), 'drift gets review');
    count++;
    const slow = { ...sample('preview'), withinBudget: false };
    const slowBundle = assembleBrowserAcceptance(plan, slow, sample('export'));
    check(slowBundle.outstandingEvidence.includes('device_performance_gate'), 'performance miss reported');
    count++;
    expects('invalid_bundle', () => assembleBrowserAcceptance(parseProCommands('/cleanup 3.0 /poseonly 2.0'), sample('preview'), sample('export')));
    count++;
    return count;
}
