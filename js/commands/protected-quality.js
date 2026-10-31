/** Export-side diagnostics from checked local protection masks.
 * Masks are supplied, never inferred from colour. No release verdict is issued.
 * Author: John Khan.
 */
import { ProRenderError, checkedFrame } from './runtime.js';
const CATEGORIES = new Set([
    'face', 'skin', 'eyes', 'hair', 'person', 'protected',
]);
function linear(byte) {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function lstar(frame, offset) {
    const pixels = frame.pixels;
    const y = 0.2126 * linear(pixels[offset]) + 0.7152 * linear(pixels[offset + 1]) +
        0.0722 * linear(pixels[offset + 2]);
    const edge = 216 / 24389;
    const pivot = y > edge ? Math.cbrt(y) : (24389 / 27 * y + 16) / 116;
    return 116 * pivot - 16;
}
function belongs(mask, x, y) {
    return mask.alpha[y * mask.width + x] > 0;
}
function edge(mask, x, y) {
    if (!belongs(mask, x, y))
        return false;
    if (x > 0 && !belongs(mask, x - 1, y))
        return true;
    if (x + 1 < mask.width && !belongs(mask, x + 1, y))
        return true;
    if (y > 0 && !belongs(mask, x, y - 1))
        return true;
    if (y + 1 < mask.height && !belongs(mask, x, y + 1))
        return true;
    return false;
}
export function checkedProtectionMask(mask, frame) {
    if (!CATEGORIES.has(mask.category) || mask.width !== frame.width ||
        mask.height !== frame.height || !Number.isInteger(mask.width) ||
        !Number.isInteger(mask.height) || !(mask.alpha instanceof Uint8Array) ||
        mask.alpha.byteLength !== mask.width * mask.height ||
        typeof mask.userChecked !== 'boolean') {
        throw new ProRenderError('invalid_mask', 'A region mask must match the image and evidence schema.');
    }
    return mask;
}
export function measureProtectedRegions(original, edited, masks, required = []) {
    checkedFrame(original);
    checkedFrame(edited);
    if (original.width !== edited.width || original.height !== edited.height ||
        original.channels !== edited.channels) {
        throw new ProRenderError('invalid_quality_frame', 'Align both frames before measuring.');
    }
    if (!Array.isArray(masks) || masks.length > 16 || !Array.isArray(required) ||
        required.some(category => !CATEGORIES.has(category))) {
        throw new ProRenderError('invalid_mask', 'Protection evidence is invalid.');
    }
    const names = new Set();
    const readings = [];
    for (const mask of masks) {
        checkedProtectionMask(mask, original);
        if (names.has(mask.category)) {
            throw new ProRenderError('invalid_mask', 'Protection categories must be unique.');
        }
        names.add(mask.category);
        let eligible = 0;
        let changed = 0;
        let totalDifference = 0;
        let maxDifference = 0;
        let edgeDifference = 0;
        let skinRise = -Infinity;
        let alphaMismatch = 0;
        for (let pixel = 0; pixel < original.width * original.height; pixel++) {
            const x = pixel % original.width;
            const y = Math.floor(pixel / original.width);
            if (!belongs(mask, x, y))
                continue;
            eligible++;
            const offset = pixel * original.channels;
            let maxChannel = 0;
            for (let channel = 0; channel < 3; channel++) {
                maxChannel = Math.max(maxChannel, Math.abs(original.pixels[offset + channel] - edited.pixels[offset + channel]));
            }
            if (maxChannel > 0)
                changed++;
            totalDifference += maxChannel;
            maxDifference = Math.max(maxDifference, maxChannel);
            if (edge(mask, x, y))
                edgeDifference = Math.max(edgeDifference, maxChannel);
            if (mask.category === 'skin') {
                skinRise = Math.max(skinRise, lstar(edited, offset) - lstar(original, offset));
            }
            if (original.channels === 4 && original.pixels[offset + 3] !== edited.pixels[offset + 3]) {
                alphaMismatch++;
            }
        }
        readings.push({
            category: mask.category,
            eligiblePixels: eligible,
            changedPixels: changed,
            meanRgbDelta: eligible > 0 ? totalDifference / eligible : null,
            largestRgbDelta: eligible > 0 ? maxDifference : null,
            boundaryLargestDelta: eligible > 0 ? edgeDifference : null,
            skinMaxLstarRise: mask.category === 'skin' && eligible > 0 ? skinRise : null,
            alphaMismatchPixels: alphaMismatch,
            referenceChecked: mask.userChecked,
            realfacePass: false,
        });
    }
    const missing = required.filter(name => !names.has(name));
    return {
        version: 'beljour-pro-protected-regions/1',
        complete: missing.length === 0 && readings.every(row => row.referenceChecked &&
            row.eligiblePixels > 0),
        readings, missingCategories: missing, realfacePass: false,
    };
}
