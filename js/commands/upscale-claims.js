/** Measured neutral-resize claims for the delivered BELJOUR image.
 * Only level 1.0 can assert byte-exact bilinear resizing of the actual
 * pre-upscale frame. Higher levels, missing cleanup intermediates and
 * independent identity/real-face qualification stay outside this claim.
 * Author: John Khan.
 */
import { referenceNeutralResize } from './neutral-reference.js';
import { checkedFrame, ProRenderError } from './runtime.js';
export const NEUTRAL_CLAIM_VERSION = 'beljour-upscale-neutral-claim/1';
export const NEUTRAL_CLAIM_COPY = 'At strength 1.0, /UPSCALE performs pixel-centre bilinear resizing without added detail. ' +
    'Pixel-exact parity applies only to delivered 2x/4x RGB/RGBA bytes compared with an independent ' +
    'resize of the exact input supplied to /UPSCALE. With /CLEANUP, the input is the guarded ' +
    'post-cleanup frame. Higher strengths use different sampling and this is not a ' +
    'reconstructed-detail, identity or real-face qualification.';
function ssimWindow(expected, actual, tile) {
    const columns = Math.ceil(expected.width / 8);
    const startY = Math.floor(tile / columns) * 8;
    const startX = (tile % columns) * 8;
    let sumA = 0;
    let sumB = 0;
    let sumAA = 0;
    let sumBB = 0;
    let sumAB = 0;
    let count = 0;
    for (let y = startY; y < Math.min(expected.height, startY + 8); y++) {
        for (let x = startX; x < Math.min(expected.width, startX + 8); x++) {
            const index = (y * expected.width + x) * expected.channels;
            for (let channel = 0; channel < 3; channel++) {
                const a = expected.pixels[index + channel] ?? 0;
                const b = actual.pixels[index + channel] ?? 0;
                sumA += a;
                sumB += b;
                sumAA += a * a;
                sumBB += b * b;
                sumAB += a * b;
                count++;
            }
        }
    }
    const muA = sumA / count;
    const muB = sumB / count;
    const va = Math.max(0, sumAA / count - muA * muA);
    const vb = Math.max(0, sumBB / count - muB * muB);
    const covariance = sumAB / count - muA * muB;
    const c1 = (0.01 * 255) ** 2;
    const c2 = (0.03 * 255) ** 2;
    const numerator = (2 * muA * muB + c1) * (2 * covariance + c2);
    const denominator = (muA * muA + muB * muB + c1) * (va + vb + c2);
    return Math.max(-1, Math.min(1, numerator / denominator));
}
export function compareNeutralOutput(expected, actual) {
    checkedFrame(expected);
    checkedFrame(actual);
    if (expected.width !== actual.width || expected.height !== actual.height ||
        expected.channels !== actual.channels) {
        throw new ProRenderError('invalid_neutral_reference', 'The output and reference geometry differ.');
    }
    const byChannel = new Array(expected.channels).fill(0);
    let different = 0;
    let maximum = 0;
    let squares = 0;
    let first = null;
    for (let i = 0; i < expected.pixels.length; i++) {
        const delta = Math.abs((expected.pixels[i] ?? 0) - (actual.pixels[i] ?? 0));
        if (delta > 0) {
            different++;
            const channel = i % expected.channels;
            byChannel[channel] = (byChannel[channel] ?? 0) + 1;
            if (first === null) {
                const pixel = Math.floor(i / expected.channels);
                first = [Math.floor(pixel / expected.width), pixel % expected.width, channel];
            }
            maximum = Math.max(maximum, delta);
        }
        squares += delta * delta;
    }
    const mse = squares / expected.pixels.length;
    const rows = Math.ceil(expected.height / 8);
    const columns = Math.ceil(expected.width / 8);
    const availableWindows = rows * columns;
    const count = Math.min(512, availableWindows);
    let ssim = 0;
    for (let i = 0; i < count; i++) {
        const tile = count === 1 ? 0 : Math.floor(i * (availableWindows - 1) / (count - 1));
        ssim += ssimWindow(expected, actual, tile);
    }
    return Object.freeze({
        comparedBytes: expected.pixels.length,
        differentBytes: different,
        maxDelta: maximum,
        firstDifference: first,
        differencesPerChannel: Object.freeze(byChannel),
        mseByte: mse,
        psnrDb: mse === 0 ? null : 10 * Math.log10((255 * 255) / mse),
        ssim8Rgb: ssim / count,
        ssimWindowsSampled: count,
    });
}
export function evaluateNeutralUpscaleClaim(source, delivered, options) {
    checkedFrame(source);
    checkedFrame(delivered);
    if (options.factor !== 2 && options.factor !== 4) {
        throw new ProRenderError('invalid_scale', 'Only 2x and 4x may be compared.');
    }
    if (!Number.isInteger(options.levelTenths) || options.levelTenths < 10 ||
        options.levelTenths > 50 || typeof options.preview !== 'boolean') {
        throw new ProRenderError('invalid_claim', 'A valid editor level and preview flag are required.');
    }
    let stage = 'original';
    let original = source;
    if (options.postCleanup !== undefined) {
        checkedFrame(options.postCleanup);
        if (options.postCleanup.width !== source.width ||
            options.postCleanup.height !== source.height ||
            options.postCleanup.channels !== source.channels) {
            throw new ProRenderError('invalid_cleanup_source', 'Cleanup cannot alter image geometry.');
        }
        original = options.postCleanup;
        stage = 'post_cleanup';
    }
    const expected = referenceNeutralResize(original, options.factor);
    const comparison = compareNeutralOutput(expected, delivered);
    const status = options.levelTenths !== 10 ? 'OUTSIDE_SCOPE' :
        comparison.differentBytes === 0 ? 'PIXEL_EXACT' : 'PIXEL_MISMATCH';
    return Object.freeze({
        version: NEUTRAL_CLAIM_VERSION,
        status,
        pixelExact: status === 'PIXEL_EXACT',
        stage,
        factor: options.factor,
        levelTenths: options.levelTenths,
        preview: options.preview,
        cleanupBeforeUpscale: stage === 'post_cleanup',
        comparison,
        releaseApproved: false,
        identityProved: false,
        claimCopy: NEUTRAL_CLAIM_COPY,
    });
}
//# sourceMappingURL=upscale-claims.js.map