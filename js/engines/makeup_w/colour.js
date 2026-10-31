export function srgbToLinear(value) {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}
export function rgbToLab(rgb) {
    const r = srgbToLinear(rgb[0]);
    const g = srgbToLinear(rgb[1]);
    const b = srgbToLinear(rgb[2]);
    const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
    const delta = 6 / 29;
    const f = (value) => value > delta ** 3 ? Math.cbrt(value) : value / (3 * delta * delta) + 4 / 29;
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToLch(lab) {
    const chroma = Math.hypot(lab[1], lab[2]);
    const hue = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
    return [lab[0], chroma, hue];
}
export function hueDistance(a, b) {
    const distance = Math.abs((a - b) % 360);
    return Math.min(distance, 360 - distance);
}
export function undertoneHue(name) {
    return { cool: 345, neutral: 25, warm: 55, olive: 92 }[name] ?? 25;
}
export function compatibility(rgb, undertone) {
    const lch = labToLch(rgbToLab(rgb));
    return Math.max(0, 1 - hueDistance(lch[2], undertoneHue(undertone)) / 180) *
        (0.4 + 0.6 * Math.min(lch[1] / 60, 1));
}
/**
 * Mirror api/plumb_api/engines/makeup_w/finishes.py::apply_tint.
 * The Python implementation uses mean RGB, not Lab L*, for the no-lightening
 * clamp and converts to uint8 by truncation. Keep those details identical so
 * parity is bounded to one byte per channel.
 */
export function applyTint(photo, mask, colour, amount, neverLighten = true) {
    if (mask.length !== photo.width * photo.height) {
        throw new RangeError("mask size mismatch");
    }
    const out = new Uint8ClampedArray(photo.data);
    const targetLuma = Math.max((colour[0] + colour[1] + colour[2]) / 3, 1);
    for (let i = 0; i < mask.length; i++) {
        const alpha = Math.max(0, Math.min(1, mask[i] * amount));
        if (alpha <= 0)
            continue;
        const offset = i * photo.channels;
        const src0 = photo.data[offset];
        const src1 = photo.data[offset + 1];
        const src2 = photo.data[offset + 2];
        const sourceLuma = (src0 + src1 + src2) / 3;
        const ratio = neverLighten ? Math.min(sourceLuma / targetLuma, 1) : 1;
        for (let channel = 0; channel < 3; channel++) {
            const source = photo.data[offset + channel];
            const target = colour[channel] * ratio;
            out[offset + channel] = Math.trunc(source * (1 - alpha) + target * alpha);
        }
        if (photo.channels === 4)
            out[offset + 3] = photo.data[offset + 3];
    }
    return out;
}
function blurRgb(photo) {
    const output = new Float64Array(photo.width * photo.height * 3);
    for (let y = 0; y < photo.height; y++) {
        for (let x = 0; x < photo.width; x++) {
            const pixel = y * photo.width + x;
            for (let channel = 0; channel < 3; channel++) {
                let total = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const yy = Math.max(0, Math.min(photo.height - 1, y + dy));
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = Math.max(0, Math.min(photo.width - 1, x + dx));
                        total += photo.data[(yy * photo.width + xx) * photo.channels + channel];
                    }
                }
                output[pixel * 3 + channel] = total / 9;
            }
        }
    }
    return output;
}
/** Mirror the Python local finish shader without changing face geometry. */
export function applyFinish(photo, mask, finish, amount) {
    if (mask.length !== photo.width * photo.height)
        throw new RangeError("mask size mismatch");
    if (!Number.isFinite(amount) || amount < 0 || amount > 1)
        throw new RangeError("amount outside range");
    const blur = blurRgb(photo);
    const out = new Uint8ClampedArray(photo.data);
    for (let i = 0; i < mask.length; i++) {
        const alpha = Math.max(0, Math.min(1, mask[i] * amount));
        if (alpha <= 0)
            continue;
        const offset = i * photo.channels;
        for (let channel = 0; channel < 3; channel++) {
            const source = photo.data[offset + channel];
            const blurred = blur[i * 3 + channel];
            const detail = source - blurred;
            let styled = source;
            if (finish === "matte")
                styled = blurred + detail * 0.72;
            else if (finish === "dewy")
                styled = source + Math.max(detail, 0) * 0.35;
            else if (finish === "skin_tint")
                styled = source * 0.96 + blurred * 0.04;
            else if (finish === "powder")
                styled = Math.min(blurred + detail * 0.40 - 1.5, source);
            else if (finish === "cream")
                styled = Math.min(blurred + detail * 1.10 - 0.25, source);
            const value = source * (1 - alpha) + styled * alpha;
            out[offset + channel] = Math.trunc(Math.max(0, Math.min(255, value)));
        }
        if (photo.channels === 4)
            out[offset + 3] = photo.data[offset + 3];
    }
    return out;
}
