/** Final-byte claim regression for the BELJOUR Quality Generator.
 * Uses procedural RGB/RGBA arrays and the independent scalar reference.
 * Author: John Khan.
 */
import { CpuUpscale } from './cpu-upscale.js';
import { referenceNeutralResize } from './neutral-reference.js';
import { ProRenderError } from './runtime.js';
import { compareNeutralOutput, evaluateNeutralUpscaleClaim, NEUTRAL_CLAIM_COPY, } from './upscale-claims.js';
function assert(condition, reason) {
    if (!condition)
        throw new Error(reason);
}
function synthetic(width, height, channels, pattern) {
    const pixels = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * channels;
            const base = pattern === 0 ? 81 : pattern === 1 ?
                (x + y) % 2 * 255 : (x * 37 + y * 11 + 13) % 256;
            pixels[offset] = base;
            pixels[offset + 1] = (base * 3 + 17) % 256;
            pixels[offset + 2] = (base * 7 + 9) % 256;
            if (channels === 4)
                pixels[offset + 3] = (x * 13 + y * 19 + 29) % 256;
        }
    }
    return { width, height, channels, pixels };
}
function altered(frame, offset) {
    const pixels = new Uint8Array(frame.pixels);
    pixels[offset] = ((pixels[offset] ?? 0) + 1) % 256;
    return { ...frame, pixels };
}
export function testUpscaleClaimsHGap1() {
    let checks = 0;
    for (const [width, height] of [[1, 1], [7, 5], [19, 17], [43, 37]]) {
        for (const channels of [3, 4]) {
            for (const factor of [2, 4]) {
                for (let kind = 0; kind < 3; kind++) {
                    const source = synthetic(width ?? 1, height ?? 1, channels, kind);
                    const bytesBefore = new Uint8Array(source.pixels);
                    const original = referenceNeutralResize(source, factor);
                    const rendered = new CpuUpscale(null, 17).render(source, factor, 10, false);
                    const report = evaluateNeutralUpscaleClaim(source, rendered, {
                        factor, levelTenths: 10, preview: false,
                    });
                    assert(report.status === 'PIXEL_EXACT', 'Neutral final output differs from reference');
                    assert(report.pixelExact, 'Neutral pixel claim not certified');
                    assert(report.comparison.differentBytes === 0, 'Nonzero byte mismatch');
                    assert(report.comparison.psnrDb === null, 'Identical output must have infinite PSNR');
                    assert(Math.abs(report.comparison.ssim8Rgb - 1) < 1e-10, 'Identical windowed SSIM');
                    assert(report.comparison.comparedBytes === original.pixels.length, 'Output count mismatch');
                    assert(source.pixels.every((value, i) => value === bytesBefore[i]), 'Mutated input');
                    assert(!report.identityProved && !report.releaseApproved, 'Claim escalated to release');
                    checks += 8;
                }
            }
        }
    }
    return checks;
}
export function testUpscaleClaimGuardHGap1() {
    let checks = 0;
    const source = synthetic(19, 13, 4, 2);
    const reference = referenceNeutralResize(source, 2);
    for (let channel = 0; channel < 4; channel++) {
        const offset = (3 * reference.width + 5) * 4 + channel;
        const changed = altered(reference, offset);
        const actual = evaluateNeutralUpscaleClaim(source, changed, {
            factor: 2, levelTenths: 10, preview: true,
        });
        assert(actual.status === 'PIXEL_MISMATCH', 'Modified output passed pixel guard');
        assert(!actual.pixelExact, 'Modified output is not pixel exact');
        assert(actual.comparison.differentBytes === 1, 'Must find one modified byte');
        assert(actual.comparison.firstDifference?.join(',') === `3,5,${channel}`, 'Wrong pixel location');
        assert(actual.comparison.differencesPerChannel[channel] === 1, 'Wrong channel count');
        assert(actual.comparison.maxDelta === 1, 'Unexpected maximum difference');
        assert(actual.comparison.psnrDb !== null, 'Changed output cannot have infinite PSNR');
        checks += 7;
    }
    for (const levelTenths of [11, 12, 20, 33, 40, 50]) {
        const claim = evaluateNeutralUpscaleClaim(source, reference, {
            factor: 2, levelTenths, preview: false,
        });
        assert(claim.status === 'OUTSIDE_SCOPE', 'Higher-strength output cannot claim neutral parity');
        assert(!claim.pixelExact, 'Outside-scope output should be unqualified');
        checks += 2;
    }
    return checks;
}
export function testCleanupScopeHGap1() {
    let checks = 0;
    const source = synthetic(23, 19, 4, 2);
    const cleaned = altered(source, 35);
    const output = referenceNeutralResize(cleaned, 2);
    const scoped = evaluateNeutralUpscaleClaim(source, output, {
        factor: 2, levelTenths: 10, preview: false, postCleanup: cleaned,
    });
    const unscoped = evaluateNeutralUpscaleClaim(source, output, {
        factor: 2, levelTenths: 10, preview: false,
    });
    assert(scoped.stage === 'post_cleanup', 'Cleanup reference stage not recorded');
    assert(scoped.cleanupBeforeUpscale && scoped.pixelExact, 'Guarded cleanup output unverified');
    assert(unscoped.status === 'PIXEL_MISMATCH', 'Must not compare cleanup to earlier source');
    assert(NEUTRAL_CLAIM_COPY.includes('post-cleanup'), 'Contract omits pre-step disclosure');
    assert(!scoped.releaseApproved && !scoped.identityProved, 'Pipeline bypassed independent gate');
    checks += 5;
    const alteredOutput = altered(output, 77);
    const rejected = evaluateNeutralUpscaleClaim(source, alteredOutput, {
        factor: 2, levelTenths: 10, preview: true, postCleanup: cleaned,
    });
    assert(rejected.status === 'PIXEL_MISMATCH', 'Guard changed final output without invalidation');
    checks++;
    return checks;
}
export function testInvalidNeutralClaimsHGap1() {
    let checks = 0;
    const source = synthetic(9, 7, 3, 2);
    const full = referenceNeutralResize(source, 2);
    const wrong = synthetic(10, 8, 3, 1);
    const bad = [
        () => evaluateNeutralUpscaleClaim(source, full, { factor: 2, levelTenths: 0, preview: true }),
        () => evaluateNeutralUpscaleClaim(source, full, { factor: 2, levelTenths: 55, preview: true }),
        () => evaluateNeutralUpscaleClaim(source, full, { factor: 2, levelTenths: 21.5, preview: true }),
        () => evaluateNeutralUpscaleClaim(source, full, {
            factor: 2, levelTenths: 10, preview: true, postCleanup: wrong,
        }),
        () => compareNeutralOutput(source, full),
    ];
    for (const operation of bad) {
        let rejected = false;
        try {
            operation();
        }
        catch (err) {
            rejected = err instanceof ProRenderError;
        }
        assert(rejected, 'Invalid neutral claim did not fail closed');
        checks++;
    }
    return checks;
}
