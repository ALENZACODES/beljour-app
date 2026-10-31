import { checkedFrame, ProRenderError } from './runtime.js';
function bounded(value) { return Math.max(0, Math.min(255, Math.floor(value + 0.5))); }
function indexOf(frame, x, y, channel) {
    return (Math.max(0, Math.min(frame.height - 1, y)) * frame.width +
        Math.max(0, Math.min(frame.width - 1, x))) * frame.channels + channel;
}
function local(frame, x, y, channel) {
    return frame.pixels[indexOf(frame, x, y, channel)] ?? 0;
}
function lowpass(frame) {
    const pixels = new Float32Array(frame.width * frame.height * 3);
    const weights = [1, 4, 6, 4, 1];
    for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
            for (let channel = 0; channel < 3; channel++) {
                let value = 0;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        value += local(frame, x + dx, y + dy, channel) *
                            (weights[dx + 2] ?? 0) * (weights[dy + 2] ?? 0);
                    }
                }
                pixels[(y * frame.width + x) * 3 + channel] = value / 256;
            }
        }
    }
    return pixels;
}
function coverage(spots, x, y, frame) {
    let result = 0;
    for (const spot of spots) {
        const dx = (x + 0.5) / frame.width - spot.x;
        const dy = (y + 0.5) / frame.height - spot.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const inner = spot.radius * 0.55;
        result = Math.max(result, Math.max(0, Math.min(1, (spot.radius - distance) /
            Math.max(0.00001, spot.radius - inner))));
    }
    return result;
}
export function validateSpots(spots) {
    if (spots.length > 24 || spots.some((spot) => !Number.isFinite(spot.x) ||
        !Number.isFinite(spot.y) || !Number.isFinite(spot.radius) ||
        spot.x < 0 || spot.x > 1 || spot.y < 0 || spot.y > 1 ||
        spot.radius <= 0 || spot.radius > 0.1)) {
        throw new ProRenderError('invalid_spots', 'Checked spot boundaries are invalid.');
    }
}
function skinLightness(red, green, blue) {
    const linear = (byte) => {
        const encoded = byte / 255;
        return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
    };
    const y = 0.2126729 * linear(red) + 0.7151522 * linear(green) + 0.0721750 * linear(blue);
    return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}
function capSkinRise(before, after) {
    const initial = skinLightness(before[0] ?? 0, before[1] ?? 0, before[2] ?? 0);
    const selected = skinLightness(after[0] ?? 0, after[1] ?? 0, after[2] ?? 0);
    if (selected - initial <= 2.4)
        return after;
    let low = 0;
    let high = 1;
    let safe = before;
    for (let attempt = 0; attempt < 12; attempt++) {
        const middle = (low + high) / 2;
        const trial = before.map((value, channel) => bounded(value + ((after[channel] ?? value) - value) * middle));
        if (skinLightness(trial[0] ?? 0, trial[1] ?? 0, trial[2] ?? 0) - initial <= 2.4) {
            safe = trial;
            low = middle;
        }
        else {
            high = middle;
        }
    }
    return safe;
}
export class CpuCleanup {
    regions;
    spots;
    lastMetrics = null;
    constructor(regions = null, spots = []) {
        this.regions = regions;
        this.spots = spots;
        validateSpots(spots);
    }
    render(frame, level, preview, signal) {
        const started = performance.now();
        checkedFrame(frame);
        if (!Number.isInteger(level) || level < 10 || level > 50) {
            throw new ProRenderError('invalid_level', 'Editor level must be 1.0–5.0 in tenths.');
        }
        const dose = level / 50;
        const softened = lowpass(frame);
        const output = new Uint8Array(frame.pixels);
        const skin = this.regions?.mask('skin', frame.width, frame.height);
        const eyes = this.regions?.mask('eyes', frame.width, frame.height);
        const hair = this.regions?.mask('hair', frame.width, frame.height);
        const protectedPixels = this.regions?.mask('protected', frame.width, frame.height);
        let corrected = 0;
        let dust = 0;
        for (let y = 0; y < frame.height; y++) {
            if (signal?.aborted)
                throw new ProRenderError('stale_preview', 'Preview was cancelled.');
            for (let x = 0; x < frame.width; x++) {
                const pixel = y * frame.width + x;
                if ((protectedPixels?.[pixel] ?? 0) > 0 || (eyes?.[pixel] ?? 0) > 0)
                    continue;
                const edge = Math.max(...[0, 1, 2].map((channel) => Math.max(Math.abs(local(frame, x, y, channel) - local(frame, x + 1, y, channel)), Math.abs(local(frame, x, y, channel) - local(frame, x, y + 1, channel))))) / 255;
                const protection = Math.min(1, edge / 0.055);
                let amount = dose * (1 - 0.88 * protection) * 0.38;
                amount *= (1 - 0.35 * (skin?.[pixel] ?? 0));
                amount *= (1 - 0.9 * (hair?.[pixel] ?? 0));
                const manual = coverage(this.spots, x, y, frame);
                for (let channel = 0; channel < 3; channel++) {
                    const offset = pixel * frame.channels + channel;
                    const current = frame.pixels[offset] ?? 0;
                    const base = softened[pixel * 3 + channel] ?? current;
                    let changed = current + (base - current) * Math.max(amount, manual * dose * 0.8);
                    if (x > 0 && x < frame.width - 1 && y > 0 && y < frame.height - 1) {
                        const adjacent = [local(frame, x - 1, y, channel), local(frame, x + 1, y, channel),
                            local(frame, x, y - 1, channel), local(frame, x, y + 1, channel)];
                        const allHigh = adjacent.every((value) => current - value > 79);
                        const allLow = adjacent.every((value) => value - current > 79);
                        if (allHigh || allLow) {
                            changed = current + (adjacent.reduce((sum, value) => sum + value, 0) / 4 - current) * dose * 0.95;
                            if (channel === 0)
                                dust++;
                        }
                    }
                    // A periodic deblock can only operate at recorded 8-pixel seams.
                    if (x > 8 && x % 8 === 0 && x < frame.width - 1) {
                        const left = local(frame, x - 1, y, channel);
                        const seam = Math.abs(current - left);
                        if (seam > 12 && Math.abs(current - local(frame, x + 1, y, channel)) < seam * 0.7) {
                            changed += (left - current) * dose * 0.12;
                        }
                    }
                    output[offset] = bounded(changed);
                    if (output[offset] !== current && channel === 0)
                        corrected++;
                }
                if ((skin?.[pixel] ?? 0) > 0) {
                    const offset = pixel * frame.channels;
                    const before = Array.from(frame.pixels.slice(offset, offset + 3));
                    const after = Array.from(output.slice(offset, offset + 3));
                    const safe = capSkinRise(before, after);
                    for (let channel = 0; channel < 3; channel++) {
                        output[offset + channel] = safe[channel] ?? 0;
                    }
                }
            }
        }
        this.lastMetrics = {
            correctedPixels: corrected, dustPixels: dust, preview,
            elapsedMs: performance.now() - started,
            targetMs: 100,
            withinTarget: performance.now() - started <= 100,
        };
        return { width: frame.width, height: frame.height, channels: frame.channels, pixels: output };
    }
}
