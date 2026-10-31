export function recolour(photo, mask, colour, amount, preserve = .75) { const out = new Uint8ClampedArray(photo.data); for (let i = 0; i < mask.length; i++) {
    const a = Math.max(0, Math.min(1, mask[i] * amount));
    if (a <= 0)
        continue;
    const o = i * photo.channels;
    const lum = .2126 * out[o] + .7152 * out[o + 1] + .0722 * out[o + 2];
    const tl = Math.max(.2126 * colour[0] + .7152 * colour[1] + .0722 * colour[2], 1);
    for (let c = 0; c < 3; c++) {
        const normalized = colour[c] * (lum / tl);
        const target = preserve * normalized + (1 - preserve) * colour[c];
        out[o + c] = Math.round(out[o + c] * (1 - a) + target * a);
    }
    if (photo.channels === 4)
        out[o + 3] = photo.data[o + 3];
} return out; }
export function blendGrey(photo, mask, share, amount) { const out = new Uint8ClampedArray(photo.data); for (let i = 0; i < mask.length; i++) {
    const a = Math.max(0, Math.min(1, mask[i] * share * amount));
    if (a <= 0)
        continue;
    const o = i * photo.channels;
    const y = .2126 * out[o] + .7152 * out[o + 1] + .0722 * out[o + 2];
    const target = [y * 1.08 + 18, y * 1.07 + 17, y * 1.06 + 16];
    for (let c = 0; c < 3; c++)
        out[o + c] = Math.round(out[o + c] * (1 - a) + target[c] * a);
    if (photo.channels === 4)
        out[o + 3] = photo.data[o + 3];
} return out; }
export function edgeEnergy(photo, data, mask) { let sum = 0, n = 0; const grey = (i) => { const o = i * photo.channels; return (data[o] + data[o + 1] + data[o + 2]) / 3; }; for (let y = 1; y < photo.height - 1; y++)
    for (let x = 1; x < photo.width - 1; x++) {
        const i = y * photo.width + x;
        if (mask[i] <= .25)
            continue;
        const gx = (grey(i + 1) - grey(i - 1)) * .5, gy = (grey(i + photo.width) - grey(i - photo.width)) * .5;
        sum += Math.hypot(gx, gy);
        n++;
    } return n ? sum / n : 0; }
export function textureRatio(photo, after, mask) { const before = edgeEnergy(photo, photo.data, mask); return before <= 1e-9 ? 1 : edgeEnergy(photo, after, mask) / before; }
export function defineCurls(photo, mask, amount) { const out = new Uint8ClampedArray(photo.data); for (let y = 1; y < photo.height - 1; y++)
    for (let x = 1; x < photo.width - 1; x++) {
        const i = y * photo.width + x, a = mask[i] * amount;
        if (a <= 0)
            continue;
        for (let c = 0; c < 3; c++) {
            let mean = 0;
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                    mean += photo.data[((y + dy) * photo.width + x + dx) * photo.channels + c];
            mean /= 9;
            const detail = photo.data[i * photo.channels + c] - mean;
            out[i * photo.channels + c] = Math.round(photo.data[i * photo.channels + c] + detail * .55 * a);
        }
    } return out; }
