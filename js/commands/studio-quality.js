import { protectStudioPixel } from './studio-protection.js';
import { checkedFrame, ProRenderError } from './runtime.js';
// Editorial lighting reference, not a measured release verdict.
export const STUDIO_LIGHT_REFERENCE = 'STUDIO light: cover lighting; soft key; gentle sculpting; texture preserved; colour true.';
export const DEFAULT_STUDIO_CONTROLS = Object.freeze({
    exposureEv: 0.48, contrast: 0.18, warmth: 0.025,
    clarity: 0.12, highlightRecovery: 0.30,
});
function checkedControls(value) {
    const numbers = [value.exposureEv, value.contrast, value.warmth,
        value.clarity, value.highlightRecovery];
    if (!numbers.every((number) => Number.isFinite(number)) ||
        Math.abs(value.exposureEv) > 1 || Math.abs(value.contrast) > 0.4 ||
        Math.abs(value.warmth) > 0.06 || value.clarity < 0 || value.clarity > 0.3 ||
        value.highlightRecovery < 0 || value.highlightRecovery > 0.5) {
        throw new ProRenderError('invalid_studio', 'Studio controls exceed safe limits.');
    }
    return Object.freeze({ ...value });
}
function levelFraction(level) {
    if (!Number.isInteger(level) || level < 10 || level > 50) {
        throw new ProRenderError('invalid_level', 'Use 1.0 to 5.0 in 0.1 steps.');
    }
    return (level - 10) / 40;
}
function linear(value) {
    const encoded = value / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
}
function encoded(value) {
    const clamped = Math.max(0, Math.min(1, value));
    const srgb = clamped <= 0.0031308 ? 12.92 * clamped :
        1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.floor(srgb * 255 + 0.5)));
}
function yLight(r, g, b) {
    return linear(r) * 0.2126729 + linear(g) * 0.7151522 + linear(b) * 0.072175;
}
function labL(value) {
    return value > 216 / 24389 ? 116 * Math.cbrt(value) - 16 : (24389 / 27) * value;
}
function luma(frame, x, y) {
    const safeX = Math.max(0, Math.min(frame.width - 1, x));
    const safeY = Math.max(0, Math.min(frame.height - 1, y));
    const i = (safeY * frame.width + safeX) * frame.channels;
    return yLight(frame.pixels[i] ?? 0, frame.pixels[i + 1] ?? 0, frame.pixels[i + 2] ?? 0);
}
function smoothLuma(frame, x, y) {
    const weights = [1, 4, 6, 4, 1];
    let value = 0;
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            value += luma(frame, x + dx, y + dy) *
                (weights[dx + 2] ?? 0) * (weights[dy + 2] ?? 0);
        }
    }
    return value / 256;
}
export class CpuStudioQuality {
    regions;
    tileRows;
    lastMetrics = null;
    controls;
    constructor(regions = null, controls = DEFAULT_STUDIO_CONTROLS, tileRows = 64) {
        this.regions = regions;
        this.tileRows = tileRows;
        if (!Number.isInteger(tileRows) || tileRows < 16 || tileRows > 512) {
            throw new ProRenderError('invalid_tiles', 'Studio tile rows must be 16 to 512.');
        }
        this.controls = checkedControls(controls);
    }
    render(frame, level, preview, signal) {
        const started = performance.now();
        checkedFrame(frame);
        const amount = levelFraction(level);
        if (amount === 0) {
            this.lastMetrics = { level: (level / 10).toFixed(1),
                elapsedMs: performance.now() - started, preview,
                tileCount: 0, peakWorkingBytes: 0, modifiedPixels: 0,
                protectedUnchanged: true, alphaUnchanged: true };
            return frame;
        }
        const output = new Uint8Array(frame.pixels);
        const skin = this.regions?.mask('skin', frame.width, frame.height) ?? null;
        const eyes = this.regions?.mask('eyes', frame.width, frame.height) ?? null;
        const protectedMask = this.regions?.mask('protected', frame.width, frame.height) ?? null;
        const ctrl = this.controls;
        const warm = ctrl.warmth * amount;
        const exposure = 2 ** (ctrl.exposureEv * amount);
        const gamma = 1 - 0.20 * ctrl.contrast * amount;
        let modified = 0;
        let safe = true;
        let tiles = 0;
        let maximumSkinLiftL = 0;
        let adjustedSkinPixels = 0;
        const original = frame.pixels;
        for (let y0 = 0; y0 < frame.height; y0 += this.tileRows) {
            if (signal?.aborted)
                throw new ProRenderError('stale_preview', 'Studio edit was cancelled.');
            const y1 = Math.min(frame.height, y0 + this.tileRows);
            for (let y = y0; y < y1; y++) {
                for (let x = 0; x < frame.width; x++) {
                    const position = y * frame.width + x;
                    const i = position * frame.channels;
                    const originalR = original[i] ?? 0;
                    const originalG = original[i + 1] ?? 0;
                    const originalB = original[i + 2] ?? 0;
                    if ((protectedMask?.[position] ?? 0) > 0 ||
                        (eyes?.[position] ?? 0) >= 1)
                        continue;
                    const originalY = yLight(originalR, originalG, originalB);
                    const texture = Math.max(-0.025, Math.min(0.025, ctrl.clarity * amount * (originalY - smoothLuma(frame, x, y))));
                    const originals = [originalR, originalG, originalB];
                    const weights = [1 + warm, 1, 1 - warm];
                    const candidates = [];
                    for (let channel = 0; channel < 3; channel++) {
                        let colour = linear(originals[channel] ?? 0) * exposure;
                        colour /= 1 + ctrl.highlightRecovery * amount * Math.max(0, colour - 0.35);
                        colour = Math.max(0, Math.min(1, colour)) ** gamma;
                        colour = Math.max(0, Math.min(1, colour * (weights[channel] ?? 1) + texture));
                        candidates.push(encoded(colour));
                    }
                    const sourceSkin = skin?.[position] ?? 0;
                    if (sourceSkin > 0) {
                        const changedY = yLight(candidates[0] ?? 0, candidates[1] ?? 0, candidates[2] ?? 0);
                        const lightRise = labL(changedY) - labL(originalY);
                        const cap = lightRise > 2.3 ? 2.3 / lightRise : 1;
                        const blend = cap * (1 - 0.40 * sourceSkin);
                        for (let channel = 0; channel < 3; channel++) {
                            const from = originals[channel] ?? 0;
                            candidates[channel] = Math.floor(from + ((candidates[channel] ?? from) - from) * blend + 0.5);
                        }
                    }
                    if (sourceSkin > 0) {
                        const evaluated = protectStudioPixel([originalR, originalG, originalB], [candidates[0] ?? originalR, candidates[1] ?? originalG,
                            candidates[2] ?? originalB], sourceSkin);
                        candidates[0] = evaluated.rgb[0];
                        candidates[1] = evaluated.rgb[1];
                        candidates[2] = evaluated.rgb[2];
                        maximumSkinLiftL = Math.max(maximumSkinLiftL, evaluated.liftL);
                        if (evaluated.adjusted)
                            adjustedSkinPixels++;
                    }
                    let changed = false;
                    for (let channel = 0; channel < 3; channel++) {
                        const value = candidates[channel] ?? originals[channel] ?? 0;
                        if (value !== originals[channel])
                            changed = true;
                        output[i + channel] = value;
                    }
                    if (changed)
                        modified++;
                }
            }
            tiles++;
        }
        let alphaSafe = true;
        if (frame.channels === 4) {
            for (let i = 3; i < frame.pixels.length; i += 4) {
                if (output[i] !== frame.pixels[i])
                    alphaSafe = false;
            }
        }
        this.lastMetrics = { level: (level / 10).toFixed(1),
            elapsedMs: performance.now() - started, preview,
            tileCount: tiles, peakWorkingBytes: this.tileRows * frame.width * 32,
            modifiedPixels: modified, protectedUnchanged: safe, alphaUnchanged: alphaSafe,
            maximumSkinLiftL: skin === null ? undefined : maximumSkinLiftL,
            adjustedSkinPixels };
        return { ...frame, pixels: output };
    }
}
