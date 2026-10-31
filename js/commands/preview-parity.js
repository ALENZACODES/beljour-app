/** Cross-quality browser Pro comparison with photo-free diagnostics.
 * Pixel differences are observed, never substituted for human release evidence.
 * Author: John Khan.
 */
import { ProRenderError, checkedFrame } from './runtime.js';
function referencePixel(frame, x, y, channel) {
    const sx = Math.max(0, Math.min(frame.width - 1, x));
    const sy = Math.max(0, Math.min(frame.height - 1, y));
    return frame.pixels[(sy * frame.width + sx) * frame.channels + channel];
}
function sampledReference(frame, x, y, width, height, channel) {
    const fx = Math.max(0, Math.min(frame.width - 1, (x + 0.5) * frame.width / width - 0.5));
    const fy = Math.max(0, Math.min(frame.height - 1, (y + 0.5) * frame.height / height - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const wx = fx - x0;
    const wy = fy - y0;
    const top = referencePixel(frame, x0, y0, channel) * (1 - wx) +
        referencePixel(frame, x0 + 1, y0, channel) * wx;
    const bottom = referencePixel(frame, x0, y0 + 1, channel) * (1 - wx) +
        referencePixel(frame, x0 + 1, y0 + 1, channel) * wx;
    return Math.max(0, Math.min(255, Math.floor((1 - wy) * top + wy * bottom + 0.5)));
}
export function measurePreviewParity(preview, exported, reviewMeanDelta = 3, reviewMaxDelta = 32) {
    if (preview.quality !== 'preview' || exported.quality !== 'export') {
        throw new ProRenderError('invalid_parity', 'Render labels must be preview and export.');
    }
    checkedFrame(preview.image);
    checkedFrame(exported.image);
    if (!Number.isFinite(reviewMeanDelta) || reviewMeanDelta < 0 || reviewMeanDelta > 255 ||
        !Number.isInteger(reviewMaxDelta) || reviewMaxDelta < 0 || reviewMaxDelta > 255) {
        throw new ProRenderError('invalid_parity', 'Review tolerances are invalid.');
    }
    if (preview.image.channels !== exported.image.channels ||
        exported.image.width * preview.image.height !==
            exported.image.height * preview.image.width ||
        exported.image.width < preview.image.width ||
        exported.image.height < preview.image.height) {
        throw new ProRenderError('invalid_parity', 'Preview and export geometry is incompatible.');
    }
    if (preview.steps.length !== exported.steps.length ||
        preview.steps.some((step, index) => step.command !== exported.steps[index]?.command ||
            step.level !== exported.steps[index]?.level)) {
        throw new ProRenderError('invalid_parity', 'The command plan changed between render paths.');
    }
    const low = preview.image;
    const high = exported.image;
    let sum = 0;
    let maximum = 0;
    let changed = 0;
    let alphaMismatch = 0;
    for (let pixel = 0; pixel < low.width * low.height; pixel++) {
        const x = pixel % low.width;
        const y = Math.floor(pixel / low.width);
        let different = false;
        for (let channel = 0; channel < 3; channel++) {
            const reference = sampledReference(high, x, y, low.width, low.height, channel);
            const value = Math.abs(low.pixels[pixel * low.channels + channel] - reference);
            sum += value;
            maximum = Math.max(maximum, value);
            if (value !== 0)
                different = true;
        }
        if (different)
            changed++;
        if (low.channels === 4) {
            const referenceAlpha = sampledReference(high, x, y, low.width, low.height, 3);
            if (referenceAlpha !== low.pixels[pixel * 4 + 3])
                alphaMismatch++;
        }
    }
    const mean = sum / (low.width * low.height * 3);
    const reasons = [];
    if (mean > reviewMeanDelta)
        reasons.push('mean_preview_drift');
    if (maximum > reviewMaxDelta)
        reasons.push('peak_preview_drift');
    if (alphaMismatch !== 0)
        reasons.push('alpha_preview_drift');
    if ([...preview.steps, ...exported.steps].some(step => step.identity === null)) {
        reasons.push('identity_evidence_missing');
    }
    if ([...preview.steps, ...exported.steps].some(step => step.identity?.syntheticOnly)) {
        reasons.push('synthetic_only');
    }
    return {
        version: 'beljour-pro-preview-parity/1',
        status: reasons.length > 0 ? 'needs_review' : 'measured',
        previewWidth: low.width, previewHeight: low.height,
        exportWidth: high.width, exportHeight: high.height,
        meanError: mean, maximumError: maximum,
        changedPixelFraction: changed / (low.width * low.height),
        alphaMismatchPixels: alphaMismatch, reasonCodes: reasons, realfacePass: false,
    };
}
