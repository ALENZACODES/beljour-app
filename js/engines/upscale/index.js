function cubicWeight(x, a = -.5) {
    const t = Math.abs(x);
    if (t <= 1)
        return (a + 2) * t ** 3 - (a + 3) * t ** 2 + 1;
    if (t < 2)
        return a * t ** 3 - 5 * a * t ** 2 + 8 * a * t - 4 * a;
    return 0;
}
function cubicChannel(src, width, height, scale) {
    const outWidth = width * scale, outHeight = height * scale, out = new Float64Array(outWidth * outHeight);
    for (let oy = 0; oy < outHeight; oy++) {
        const sy = (oy + .5) / scale - .5, y0 = Math.floor(sy);
        for (let ox = 0; ox < outWidth; ox++) {
            const sx = (ox + .5) / scale - .5, x0 = Math.floor(sx);
            let total = 0, weight = 0;
            for (let ky = -1; ky <= 2; ky++) {
                const yy = Math.max(0, Math.min(height - 1, y0 + ky)), wy = cubicWeight(sy - (y0 + ky));
                for (let kx = -1; kx <= 2; kx++) {
                    const xx = Math.max(0, Math.min(width - 1, x0 + kx)), ww = wy * cubicWeight(sx - (x0 + kx));
                    total += src[yy * width + xx] * ww;
                    weight += ww;
                }
            }
            out[oy * outWidth + ox] = total / Math.max(weight, 1e-12);
        }
    }
    return out;
}
function directionalRestore(src, width, height, amount) {
    const gx = new Float64Array(src.length), gy = new Float64Array(src.length), strength = new Float64Array(src.length);
    let maximum = 1e-9;
    for (let y = 0; y < height; y++)
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            gx[i] = (src[i + 1] - src[i - 1]) * .5;
        }
    for (let y = 1; y < height - 1; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            gy[i] = (src[i + width] - src[i - width]) * .5;
        }
    for (let i = 0; i < src.length; i++) {
        strength[i] = Math.hypot(gx[i], gy[i]);
        maximum = Math.max(maximum, strength[i]);
    }
    const out = new Float64Array(src.length);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x, weight = Math.max(0, Math.min(1, strength[i] / maximum)) * amount;
            const left = y * width + ((x - 1 + width) % width), right = y * width + ((x + 1) % width);
            const up = ((y - 1 + height) % height) * width + x, down = ((y + 1) % height) * width + x;
            const horizontal = (src[left] + src[right]) * .5, vertical = (src[up] + src[down]) * .5;
            const tangent = Math.abs(gx[i]) >= Math.abs(gy[i]) ? vertical : horizontal;
            out[i] = Math.max(0, Math.min(255, src[i] * (1 - weight) + tangent * weight));
        }
    return out;
}
function boxBlur(src, width, height) {
    const out = new Float64Array(src.length);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            let total = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const yy = Math.max(0, Math.min(height - 1, y + dy));
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = Math.max(0, Math.min(width - 1, x + dx));
                    total += src[yy * width + xx];
                }
            }
            out[y * width + x] = total / 9;
        }
    return out;
}
function channel(src, width, height, scale, detail) {
    const outWidth = width * scale, outHeight = height * scale;
    const enlarged = cubicChannel(src, width, height, scale);
    const restored = directionalRestore(enlarged, outWidth, outHeight, .22 + .28 * detail);
    const blurred = boxBlur(restored, outWidth, outHeight);
    const result = new Float64Array(restored.length);
    const strength = .16 + .20 * detail;
    for (let y = 0; y < outHeight; y++)
        for (let x = 0; x < outWidth; x++) {
            const i = y * outWidth + x;
            const sharpened = restored[i] + (restored[i] - blurred[i]) * strength;
            const neighbors = [
                restored[i],
                restored[((y - 1 + outHeight) % outHeight) * outWidth + x],
                restored[((y + 1) % outHeight) * outWidth + x],
                restored[y * outWidth + ((x - 1 + outWidth) % outWidth)],
                restored[y * outWidth + ((x + 1) % outWidth)],
            ];
            const low = Math.min(...neighbors) - 4, high = Math.max(...neighbors) + 4;
            result[i] = Math.max(0, Math.min(255, Math.min(Math.max(sharpened, low), high)));
        }
    return result;
}
export function upscale(photo, scale = 2, detail = .55) {
    if (photo.width < 8 || photo.height < 8 || photo.data.length !== photo.width * photo.height * photo.channels)
        throw new RangeError("invalid photo");
    if (!Number.isFinite(detail) || detail < 0 || detail > 1)
        throw new RangeError("detail outside range");
    const outWidth = photo.width * scale, outHeight = photo.height * scale, out = new Uint8ClampedArray(outWidth * outHeight * photo.channels);
    for (let c = 0; c < 3; c++) {
        const src = new Float64Array(photo.width * photo.height);
        for (let i = 0; i < src.length; i++)
            src[i] = photo.data[i * photo.channels + c];
        const values = channel(src, photo.width, photo.height, scale, detail);
        for (let i = 0; i < values.length; i++)
            out[i * photo.channels + c] = Math.round(values[i]);
    }
    if (photo.channels === 4) {
        const alpha = new Float64Array(photo.width * photo.height);
        for (let i = 0; i < alpha.length; i++)
            alpha[i] = photo.data[i * 4 + 3];
        const values = cubicChannel(alpha, photo.width, photo.height, scale);
        for (let i = 0; i < values.length; i++)
            out[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, values[i])));
    }
    return { width: outWidth, height: outHeight, channels: photo.channels, data: out };
}
export function psnr(reference, candidate) {
    if (reference.width !== candidate.width || reference.height !== candidate.height)
        throw new RangeError("shape mismatch");
    let mse = 0, n = 0;
    for (let i = 0; i < reference.width * reference.height; i++)
        for (let c = 0; c < 3; c++) {
            const delta = reference.data[i * reference.channels + c] - candidate.data[i * candidate.channels + c];
            mse += delta * delta;
            n++;
        }
    mse /= n;
    return mse === 0 ? Infinity : 20 * Math.log10(255 / Math.sqrt(mse));
}
