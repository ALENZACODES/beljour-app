export function validateImage(image, width, height) {
    if (width < 1 || height < 1 || image.length !== width * height * 4) {
        throw new Error("image must be RGBA with matching dimensions");
    }
}
export function validateMask(mask, width, height, name) {
    if (mask.length !== width * height)
        throw new Error(`${name} must be HxW`);
}
export function blankMask(width, height) {
    return new Uint8Array(width * height);
}
export function alphaBlend(image, width, height, colour, mask, amount = 255) {
    validateImage(image, width, height);
    validateMask(mask, width, height, "mask");
    if (amount < 0 || amount > 255)
        throw new Error("amount must be 0..255");
    const out = new Uint8ClampedArray(image);
    for (let i = 0; i < width * height; i += 1) {
        const alpha = Math.floor((mask[i] * amount + 127) / 255);
        const base = i * 4;
        for (let c = 0; c < 3; c += 1) {
            out[base + c] = Math.max(0, Math.min(255, Math.floor((image[base + c] * (255 - alpha) + colour[c] * alpha + 127) / 255)));
        }
    }
    return out;
}
export function restore(image, original, mask) {
    if (!mask)
        return image;
    const out = new Uint8ClampedArray(image);
    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i] === 0)
            continue;
        const base = i * 4;
        for (let c = 0; c < 4; c += 1)
            out[base + c] = original[base + c];
    }
    return out;
}
export function ellipseMask(width, height, centre, radiusX, radiusY) {
    if (radiusX <= 0 || radiusY <= 0)
        throw new Error("ellipse radii must be positive");
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const dx = (x + 0.5 - centre.x) / radiusX;
            const dy = (y + 0.5 - centre.y) / radiusY;
            if (dx * dx + dy * dy <= 1)
                out[y * width + x] = 255;
        }
    }
    return out;
}
export function maskUnion(...masks) {
    if (masks.length === 0)
        throw new Error("at least one mask required");
    const out = new Uint8Array(masks[0].length);
    for (const mask of masks) {
        for (let i = 0; i < out.length; i += 1)
            out[i] = Math.max(out[i], mask[i]);
    }
    return out;
}
export function maskSubtract(mask, remove) {
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i += 1)
        out[i] = Math.max(0, mask[i] - remove[i]);
    return out;
}
export function ringMask(width, height, centre, outerX, outerY, innerFraction) {
    return maskSubtract(ellipseMask(width, height, centre, outerX, outerY), ellipseMask(width, height, centre, outerX * innerFraction, outerY * innerFraction));
}
export function lineMask(width, height, start, end, thickness) {
    const out = new Uint8Array(width * height);
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const denom = vx * vx + vy * vy;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const px = x + 0.5;
            const py = y + 0.5;
            const t = denom <= 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - start.x) * vx + (py - start.y) * vy) / denom));
            const dx = px - (start.x + t * vx);
            const dy = py - (start.y + t * vy);
            if (dx * dx + dy * dy <= thickness * thickness)
                out[y * width + x] = 255;
        }
    }
    return out;
}
export function triangleMask(width, height, a, b, c) {
    const out = new Uint8Array(width * height);
    const edge = (p1, p2, px, py) => (px - p1.x) * (p2.y - p1.y) - (py - p1.y) * (p2.x - p1.x);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const px = x + 0.5;
            const py = y + 0.5;
            const e1 = edge(a, b, px, py);
            const e2 = edge(b, c, px, py);
            const e3 = edge(c, a, px, py);
            if ((e1 >= 0 && e2 >= 0 && e3 >= 0) || (e1 <= 0 && e2 <= 0 && e3 <= 0)) {
                out[y * width + x] = 255;
            }
        }
    }
    return out;
}
export function deterministicNoise(x, y, seed) {
    let value = (Math.imul(x, 73856093) + Math.imul(y, 19349663) + Math.imul(seed, 83492791)) >>> 0;
    value ^= value >>> 13;
    value = Math.imul(value, 1274126177) >>> 0;
    return (value & 255) - 128;
}
//# sourceMappingURL=common.js.map