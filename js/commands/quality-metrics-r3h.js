/** Source-checked PSNR/SSIM reference comparisons for local Pro effects.
 * Unknown reference images produce null metrics; never a simulated pass.
 * Author: John Khan.
 */
import { checkedFrame, ProRenderError, unchanged } from './runtime.js';
function sameShape(left, right) {
    checkedFrame(left);
    checkedFrame(right);
    if (left.width !== right.width || left.height !== right.height ||
        left.channels !== right.channels) {
        throw new ProRenderError('invalid_quality_frame', 'Quality frames must have matching geometry.');
    }
}
function channelBuffers(frame) {
    const result = [];
    for (let offset = 0; offset < frame.pixels.length; offset += frame.channels) {
        for (let channel = 0; channel < 3; channel++) {
            result.push((frame.pixels[offset + channel] ?? 0) / 255);
        }
    }
    return result;
}
function moments(a, b, channel) {
    let ma = 0;
    let mb = 0;
    const count = a.length / 3;
    for (let i = channel; i < a.length; i += 3) {
        ma += a[i] ?? 0;
        mb += b[i] ?? 0;
    }
    ma /= count;
    mb /= count;
    let va = 0;
    let vb = 0;
    let covariance = 0;
    for (let i = channel; i < a.length; i += 3) {
        const da = (a[i] ?? 0) - ma;
        const db = (b[i] ?? 0) - mb;
        va += da * da;
        vb += db * db;
        covariance += da * db;
    }
    return { ma, mb, va: va / count, vb: vb / count, covariance: covariance / count };
}
export function measuredPsnr(truth, result) {
    sameShape(truth, result);
    let squared = 0;
    let count = 0;
    for (let index = 0; index < truth.pixels.length; index += truth.channels) {
        for (let channel = 0; channel < 3; channel++) {
            const delta = ((truth.pixels[index + channel] ?? 0) -
                (result.pixels[index + channel] ?? 0)) / 255;
            squared += delta * delta;
            count++;
        }
    }
    const mse = squared / count;
    return mse <= 1e-16 ? Infinity : 10 * Math.log10(1 / mse);
}
export function measuredSsim(truth, result) {
    sameShape(truth, result);
    const a = channelBuffers(truth);
    const b = channelBuffers(result);
    let total = 0;
    for (let channel = 0; channel < 3; channel++) {
        const row = moments(a, b, channel);
        const c1 = 0.01 ** 2;
        const c2 = 0.03 ** 2;
        total += ((2 * row.ma * row.mb + c1) * (2 * row.covariance + c2)) /
            ((row.ma ** 2 + row.mb ** 2 + c1) * (row.va + row.vb + c2));
    }
    return total / 3;
}
export function qualityPoint(command, level, source, output, reference = null, scaledSource = null) {
    if (!['enhance', 'denoise', 'upscale', 'studioquality', 'poseonly'].includes(command) ||
        !Number.isInteger(level) || level < 10 || level > 50) {
        throw new ProRenderError('invalid_quality_input', 'Quality name or decimal level is invalid.');
    }
    const baseline = scaledSource ?? source;
    sameShape(baseline, output);
    if (reference !== null)
        sameShape(reference, output);
    let count = 0;
    let changed = 0;
    let alphaMax = 0;
    for (let pixel = 0; pixel < baseline.width * baseline.height; pixel++) {
        const offset = pixel * baseline.channels;
        if (baseline.pixels[offset] !== output.pixels[offset] ||
            baseline.pixels[offset + 1] !== output.pixels[offset + 1] ||
            baseline.pixels[offset + 2] !== output.pixels[offset + 2])
            changed++;
        if (baseline.channels === 4) {
            alphaMax = Math.max(alphaMax, Math.abs((baseline.pixels[offset + 3] ?? 0) -
                (output.pixels[offset + 3] ?? 0)));
        }
        count++;
    }
    const exact = reference === null ? null : unchanged(reference, output);
    let mse = null;
    if (reference !== null) {
        const value = measuredPsnr(reference, output);
        mse = Number.isFinite(value) ? Math.sqrt(10 ** (-value / 10)) : 0;
    }
    return {
        command, level: (level / 10).toFixed(1),
        psnrDb: reference === null ? null : measuredPsnr(reference, output),
        ssim: reference === null ? null : measuredSsim(reference, output),
        referenceRmse: mse, exactReferenceMatch: exact,
        modifiedFraction: changed / count, alphaMaxError: alphaMax,
        realfacePass: false,
    };
}
export function qualitySeries(command, source, steps, reference = null, scaledSource = null) {
    if (steps.length < 2 || steps.length > 41 || steps[0]?.level !== 10) {
        throw new ProRenderError('invalid_quality_sweep', 'Sweep must begin at 1.0 with two to 41 stops.');
    }
    for (let index = 1; index < steps.length; index++) {
        if ((steps[index]?.level ?? 0) <= (steps[index - 1]?.level ?? 0)) {
            throw new ProRenderError('invalid_quality_sweep', 'Sweep stops must strictly increase.');
        }
    }
    const points = steps.map((step) => qualityPoint(command, step.level, source, step.output, reference, scaledSource));
    const neutral = scaledSource ?? source;
    const neutralUnchanged = unchanged(neutral, steps[0]?.output ?? source);
    let changedMonotone = true;
    let psnrMonotone = reference === null ? null : true;
    let ssimMonotone = reference === null ? null : true;
    for (let index = 1; index < points.length; index++) {
        const prior = points[index - 1];
        const latest = points[index];
        if (prior === undefined || latest === undefined)
            continue;
        if (latest.modifiedFraction + 1e-12 < prior.modifiedFraction)
            changedMonotone = false;
        if (psnrMonotone !== null && latest.psnrDb !== null && prior.psnrDb !== null &&
            latest.psnrDb + 1e-9 < prior.psnrDb)
            psnrMonotone = false;
        if (ssimMonotone !== null && latest.ssim !== null && prior.ssim !== null &&
            latest.ssim + 1e-9 < prior.ssim)
            ssimMonotone = false;
    }
    return { command, points, neutralUnchanged, modifiedMonotone: changedMonotone,
        psnrMonotone, ssimMonotone, realfacePass: false };
}
//# sourceMappingURL=quality-metrics-r3h.js.map