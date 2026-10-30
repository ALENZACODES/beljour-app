/** Read-only repair quality measurements; never self-certifies real-face gates.
 * Author: John Khan.
 */
import { checkedFrame } from './runtime.js';
export const DEFAULT_REPAIR_LIMITS = Object.freeze({
    maxLstarRise: 2.5,
    protectedTolerance: 0,
});
function byteAt(bytes, position) {
    const value = bytes[position];
    if (value === undefined)
        throw new Error('Image buffer has an invalid pixel offset.');
    return value;
}
function lstar(red, green, blue) {
    const linear = (value) => {
        const encoded = value / 255;
        return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126729 * linear(red) + 0.7151522 * linear(green) +
        0.072175 * linear(blue);
    return luminance > 216 / 24389 ? 116 * Math.cbrt(luminance) - 16 :
        (24389 / 27) * luminance;
}
export function measureFaceFixer(original, output, regions, identity, limits = DEFAULT_REPAIR_LIMITS) {
    checkedFrame(original);
    checkedFrame(output);
    if (original.width !== output.width || original.height !== output.height ||
        original.channels !== output.channels) {
        throw new Error('Repair gate cannot evaluate a resized or retyped output.');
    }
    if (!Number.isFinite(limits.maxLstarRise) || limits.maxLstarRise < 0 ||
        !Number.isInteger(limits.protectedTolerance) || limits.protectedTolerance < 0) {
        throw new Error('Repair gate numerical limits are invalid.');
    }
    const pixels = original.width * original.height;
    for (const mask of [regions?.skin, regions?.protected]) {
        if (mask != null && mask.byteLength !== pixels) {
            throw new Error('Repair gate mask dimensions differ from the source.');
        }
    }
    let modified = 0;
    let protectedViolations = 0;
    let alphaViolations = 0;
    let skinSamples = 0;
    let maximumRise = 0;
    for (let index = 0; index < pixels; index++) {
        const offset = index * original.channels;
        const delta = [0, 1, 2].map((channel) => Math.abs(byteAt(original.pixels, offset + channel) - byteAt(output.pixels, offset + channel)));
        if (delta.some((difference) => difference > 0))
            modified++;
        if ((regions?.protected?.[index] ?? 0) > 0 &&
            delta.some((difference) => difference > limits.protectedTolerance)) {
            protectedViolations++;
        }
        if (original.channels === 4 && original.pixels[offset + 3] !== output.pixels[offset + 3]) {
            alphaViolations++;
        }
        if ((regions?.skin?.[index] ?? 0) > 0) {
            skinSamples++;
            maximumRise = Math.max(maximumRise, lstar(byteAt(output.pixels, offset), byteAt(output.pixels, offset + 1), byteAt(output.pixels, offset + 2)) -
                lstar(byteAt(original.pixels, offset), byteAt(original.pixels, offset + 1), byteAt(original.pixels, offset + 2)));
        }
    }
    const failed = [];
    const unknown = [];
    if (protectedViolations > 0)
        failed.push('protected_region_changed');
    if (alphaViolations > 0)
        failed.push('alpha_changed');
    if (skinSamples > 0 && maximumRise > limits.maxLstarRise)
        failed.push('skin_lightness_exceeded');
    if (skinSamples === 0)
        unknown.push('skin_mask_missing');
    if (regions?.protected == null)
        unknown.push('protected_mask_missing');
    if (identity === null)
        unknown.push('identity_evidence_missing');
    if (identity?.status === 'warned')
        failed.push('identity_warned');
    if (regions?.provenance !== 'authorized_external')
        unknown.push('realface_evidence_missing');
    return {
        status: failed.length > 0 ? 'fail' : 'unproven',
        reasons: [...failed, ...unknown],
        modifiedPixels: modified,
        protectedViolations,
        alphaViolations,
        skinSamples,
        maxLstarRise: skinSamples > 0 ? maximumRise : null,
        identityMatch: identity?.identityMatch ?? null,
        realfaceQualified: false,
    };
}
//# sourceMappingURL=face-fixer.js.map