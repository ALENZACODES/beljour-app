/** Read-only, original W-series pixel evidence for consented evaluators.
 * Reports aggregate counts only; no pixels, coordinates or photos are stored.
 * Author: John Khan.
 */
import { checkedImage, checkedMasks, supportMask } from './geometry.js';
import { specFor } from './specs.js';
function flag(value, name) {
    if (typeof value !== 'boolean')
        throw new Error(`${name} must be a boolean`);
    return value;
}
/** Never treats missing masks as permission to edit all pixels. */
export function auditFrame(featureId, before, after, width, height, masks, options = {}) {
    const spec = specFor(featureId);
    const shape = checkedImage(before, width, height);
    const afterShape = checkedImage(after, width, height);
    if (shape.channels !== afterShape.channels) {
        throw new Error('Before and after require identical channels');
    }
    const stripe = options.stripeHeight === undefined ? 256 : options.stripeHeight;
    if (!Number.isInteger(stripe) || stripe < 1 || stripe > 1024) {
        throw new Error('Stripe height must be an integer in 1..1024');
    }
    const calls = options.providerCalls === undefined ? 0 : options.providerCalls;
    if (!Number.isSafeInteger(calls) || calls < 0) {
        throw new Error('Invalid provider count');
    }
    const synthetic = flag(options.synthetic === undefined ? true : options.synthetic, 'synthetic');
    const consented = flag(options.consented === undefined ? false : options.consented, 'consented');
    const disclosed = flag(options.simulationDisclosed === undefined ? true : options.simulationDisclosed, 'simulationDisclosed');
    const human = options.humanAccepted ?? null;
    if (human !== null)
        flag(human, 'humanAccepted');
    const approved = checkedMasks(masks, shape, spec);
    const support = supportMask(approved, shape, spec);
    let authorized = 0;
    let changed = 0;
    let inside = 0;
    let outside = 0;
    let alpha = 0;
    let largest = 0;
    let totalDelta = 0;
    let over = 0;
    const channels = shape.channels;
    for (let start = 0; start < height; start += stripe) {
        const stop = Math.min(height, start + stripe);
        for (let y = start; y < stop; y++) {
            for (let x = 0; x < width; x++) {
                const at = y * width + x;
                const startChannel = at * channels;
                const permitted = support[at] > 0;
                if (permitted)
                    authorized++;
                let touched = false;
                let breached = false;
                for (let c = 0; c < 3; c++) {
                    const diff = Math.abs(after[startChannel + c] - before[startChannel + c]);
                    if (diff > 0)
                        touched = true;
                    if (diff > spec.maxChannelDelta)
                        breached = true;
                    if (diff > largest)
                        largest = diff;
                    totalDelta += diff;
                }
                if (touched) {
                    changed++;
                    if (permitted)
                        inside++;
                    else
                        outside++;
                }
                if (breached)
                    over++;
                if (channels === 4 && before[startChannel + 3] !== after[startChannel + 3]) {
                    alpha++;
                }
            }
        }
    }
    return {
        feature_id: featureId,
        frame_pixels: width * height,
        authorized_pixels: authorized,
        altered_rgb_pixels: changed,
        altered_rgb_inside: inside,
        altered_rgb_outside: outside,
        altered_alpha_pixels: alpha,
        max_rgb_channel_delta: largest,
        sum_rgb_channel_delta: totalDelta,
        pixels_over_limit: over,
        original_preserved: before.buffer !== after.buffer,
        provider_calls: calls,
        simulation_disclosed: disclosed,
        synthetic,
        consented,
        human_accepted: human,
    };
}
export function auditChecks(audit, spec) {
    const errors = [];
    if (audit.feature_id !== spec.id)
        errors.push('FEATURE_ID_MISMATCH');
    if (audit.authorized_pixels === 0)
        errors.push('MASK_MISSING');
    if (audit.altered_rgb_outside !== 0)
        errors.push('OUTSIDE_MASK');
    if (audit.altered_alpha_pixels !== 0)
        errors.push('ALPHA_CHANGED');
    if (audit.max_rgb_channel_delta > spec.maxChannelDelta)
        errors.push('CHANNEL_LIMIT');
    if (audit.pixels_over_limit !== 0)
        errors.push('CHANNEL_PIXEL_LIMIT');
    if (audit.provider_calls !== 0)
        errors.push('NETWORK_NOT_AUTHORIZED');
    if (!audit.original_preserved)
        errors.push('ORIGINAL_NOT_PRESERVED');
    if (!audit.simulation_disclosed)
        errors.push('SIMULATION_NOT_DISCLOSED');
    if (!audit.synthetic && !audit.consented)
        errors.push('REAL_FACE_CONSENT_REQUIRED');
    return errors;
}
