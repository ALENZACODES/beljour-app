import { ProInputError, requireDimensions } from "./types.js";
function between(value, low, high, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
        throw new ProInputError(`Mask ${label} must be between ${low} and ${high}`, "PRO_MASK_INVALID");
    }
    return value;
}
function checkPoint(value) {
    if (!value || typeof value !== "object")
        throw new ProInputError("Mask point is missing");
    between(value.x, 0, 1, "x");
    between(value.y, 0, 1, "y");
}
export function validateMasks(value) {
    if (!Array.isArray(value) || value.length > 16) {
        throw new ProInputError("A recipe supports at most sixteen local masks", "PRO_MASK_LIMIT");
    }
    for (const mask of value) {
        if (!mask || !["add", "subtract"].includes(mask.mode)) {
            throw new ProInputError("Unknown mask operation", "PRO_MASK_INVALID");
        }
        between(mask.opacity, 0, 1, "opacity");
        if (mask.kind === "brush") {
            if (!Array.isArray(mask.points) || mask.points.length < 1 || mask.points.length > 48) {
                throw new ProInputError("Brush strokes need 1 to 48 points", "PRO_MASK_LIMIT");
            }
            mask.points.forEach(checkPoint);
            between(mask.radius, 0.0005, 0.5, "brush radius");
            between(mask.hardness, 0, 1, "brush hardness");
        }
        else if (mask.kind === "linear") {
            checkPoint(mask.start);
            checkPoint(mask.end);
            between(mask.feather, 0, 1, "gradient feather");
            const dx = mask.end.x - mask.start.x;
            const dy = mask.end.y - mask.start.y;
            if (dx * dx + dy * dy < 1e-10)
                throw new ProInputError("Gradient needs two distinct points");
        }
        else if (mask.kind === "radial") {
            checkPoint(mask.center);
            between(mask.radiusX, 0.0005, 1, "radial width");
            between(mask.radiusY, 0.0005, 1, "radial height");
            between(mask.feather, 0, 1, "radial feather");
        }
        else {
            throw new ProInputError("Unknown local mask type", "PRO_MASK_INVALID");
        }
    }
}
export function sourceMaskMapping(width, height) {
    requireDimensions(width, height);
    return {
        xx: 1 / width, xy: 0, xo: 0,
        yx: 0, yy: 1 / height, yo: 0,
        sourceWidth: width, sourceHeight: height,
    };
}
export function cropMaskMapping(geometry, sourceWidth, sourceHeight) {
    requireDimensions(sourceWidth, sourceHeight);
    requireDimensions(geometry.width, geometry.height);
    const cosine = Math.cos(geometry.radians);
    const sine = Math.sin(geometry.radians);
    const stepX = geometry.projectedWidth / geometry.width;
    const stepY = geometry.projectedHeight / geometry.height;
    const centerX = geometry.rect.x + geometry.rect.width / 2;
    const centerY = geometry.rect.y + geometry.rect.height / 2;
    const xx = stepX * cosine / sourceWidth;
    const xy = stepY * sine / sourceWidth;
    const yx = -stepX * sine / sourceHeight;
    const yy = stepY * cosine / sourceHeight;
    return {
        xx, xy, xo: centerX / sourceWidth - xx * geometry.width / 2 - xy * geometry.height / 2,
        yx, yy, yo: centerY / sourceHeight - yx * geometry.width / 2 - yy * geometry.height / 2,
        sourceWidth, sourceHeight,
    };
}
function smooth(value) {
    const bounded = Math.max(0, Math.min(1, value));
    return bounded * bounded * (3 - 2 * bounded);
}
function coverage(mask, x, y, sourceWidth, sourceHeight) {
    if (mask.kind === "linear") {
        const dx = mask.end.x - mask.start.x;
        const dy = mask.end.y - mask.start.y;
        const along = ((x - mask.start.x) * dx + (y - mask.start.y) * dy) / (dx * dx + dy * dy);
        if (mask.feather === 0)
            return along >= 0.5 ? 1 : 0;
        return smooth((along - 0.5) / mask.feather + 0.5);
    }
    if (mask.kind === "radial") {
        const dx = (x - mask.center.x) / mask.radiusX;
        const dy = (y - mask.center.y) / mask.radiusY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (mask.feather === 0)
            return distance <= 1 ? 1 : 0;
        return 1 - smooth((distance - (1 - mask.feather)) / mask.feather);
    }
    const scale = Math.min(sourceWidth, sourceHeight);
    const radius = mask.radius * scale;
    let distanceSquared = Infinity;
    const px = x * sourceWidth;
    const py = y * sourceHeight;
    for (let i = 0; i < mask.points.length; i++) {
        const point = mask.points[i];
        const x1 = point.x * sourceWidth;
        const y1 = point.y * sourceHeight;
        let nearestX = x1;
        let nearestY = y1;
        if (i > 0) {
            const previous = mask.points[i - 1];
            const dx = x1 - previous.x * sourceWidth;
            const dy = y1 - previous.y * sourceHeight;
            const length = dx * dx + dy * dy;
            if (length > 0) {
                const t = Math.max(0, Math.min(1, ((px - previous.x * sourceWidth) * dx + (py - previous.y * sourceHeight) * dy) / length));
                nearestX = previous.x * sourceWidth + t * dx;
                nearestY = previous.y * sourceHeight + t * dy;
            }
        }
        const ddx = px - nearestX;
        const ddy = py - nearestY;
        distanceSquared = Math.min(distanceSquared, ddx * ddx + ddy * ddy);
    }
    if (distanceSquared >= radius * radius)
        return 0;
    const innerRadius = Math.max(0, radius * mask.hardness - 0.5);
    if (distanceSquared <= innerRadius * innerRadius)
        return 1;
    return 1 - smooth((Math.sqrt(distanceSquared) - innerRadius) / (radius - innerRadius));
}
/** Fast radial path: one affine map and a squared-distance test per pixel.
 * Avoiding virtual shape sampling in the hot loop is essential to the CPU budget.
 */
function rasterRadial(result, mask, width, height, mapping) {
    const invX = 1 / mask.radiusX;
    const invY = 1 / mask.radiusY;
    const stepX = mapping.xx * invX;
    const stepY = mapping.yx * invY;
    const inside = 1 - mask.feather;
    const insideSquared = inside * inside;
    const opacity = mask.opacity * 255;
    for (let y = 0; y < height; y++) {
        let dx = (mapping.xx * 0.5 + mapping.xy * (y + 0.5)
            + mapping.xo - mask.center.x) * invX;
        let dy = (mapping.yx * 0.5 + mapping.yy * (y + 0.5)
            + mapping.yo - mask.center.y) * invY;
        const row = y * width;
        for (let x = 0; x < width; x++) {
            const square = dx * dx + dy * dy;
            let alpha = 0;
            if (square <= insideSquared) {
                alpha = opacity;
            }
            else if (square < 1 && mask.feather > 0) {
                const t = (Math.sqrt(square) - inside) / mask.feather;
                alpha = opacity * (1 - t * t * (3 - 2 * t));
            }
            if (mask.feather === 0 && square <= 1)
                alpha = opacity;
            if (alpha > 0) {
                const index = row + x;
                const value = Math.round(alpha);
                if (mask.mode === "add") {
                    if (value > result[index])
                        result[index] = value;
                }
                else {
                    result[index] = Math.round(result[index] * (255 - value) / 255);
                }
            }
            dx += stepX;
            dy += stepY;
        }
    }
}
function rasterLinear(result, mask, width, height, mapping) {
    const dx = mask.end.x - mask.start.x;
    const dy = mask.end.y - mask.start.y;
    const invLength = 1 / (dx * dx + dy * dy);
    const xStep = (mapping.xx * dx + mapping.yx * dy) * invLength;
    const opacity = mask.opacity * 255;
    for (let y = 0; y < height; y++) {
        let along = ((mapping.xx * 0.5 + mapping.xy * (y + 0.5)
            + mapping.xo - mask.start.x) * dx
            + (mapping.yx * 0.5 + mapping.yy * (y + 0.5)
                + mapping.yo - mask.start.y) * dy) * invLength;
        const row = y * width;
        for (let x = 0; x < width; x++) {
            let t = mask.feather === 0
                ? (along >= 0.5 ? 1 : 0) : (along - 0.5) / mask.feather + 0.5;
            if (t < 0)
                t = 0;
            if (t > 1)
                t = 1;
            const value = Math.round(opacity * t * t * (3 - 2 * t));
            if (value > 0) {
                const index = row + x;
                if (mask.mode === "add") {
                    if (value > result[index])
                        result[index] = value;
                }
                else {
                    result[index] = Math.round(result[index] * (255 - value) / 255);
                }
            }
            along += xStep;
        }
    }
}
/** Returns one bounded byte per pixel, not four bytes or a retained bitmap.
 * Empty masks mean a global curve adjustment (backward compatible with v1).
 */
export function rasterMask(masks, width, height, mapping = sourceMaskMapping(width, height)) {
    requireDimensions(width, height);
    validateMasks(masks);
    if (![mapping.xx, mapping.xy, mapping.xo, mapping.yx, mapping.yy, mapping.yo,
        mapping.sourceWidth, mapping.sourceHeight].every((value) => Number.isFinite(value))) {
        throw new ProInputError("Mask coordinate transform must be finite");
    }
    if (mapping.sourceWidth < 1 || mapping.sourceHeight < 1) {
        throw new ProInputError("Mask source dimensions must be positive");
    }
    const result = new Uint8Array(width * height);
    if (masks.length === 0) {
        result.fill(255);
        return result;
    }
    for (const mask of masks) {
        if (mask.opacity === 0)
            continue;
        if (mask.kind === "radial") {
            rasterRadial(result, mask, width, height, mapping);
            continue;
        }
        if (mask.kind === "linear") {
            rasterLinear(result, mask, width, height, mapping);
            continue;
        }
        for (let y = 0; y < height; y++) {
            let sx = mapping.xx * 0.5 + mapping.xy * (y + 0.5) + mapping.xo;
            let sy = mapping.yx * 0.5 + mapping.yy * (y + 0.5) + mapping.yo;
            const row = y * width;
            for (let x = 0; x < width; x++) {
                const index = row + x;
                const alpha = Math.round(255 * mask.opacity * coverage(mask, sx, sy, mapping.sourceWidth, mapping.sourceHeight));
                if (mask.mode === "add") {
                    if (alpha > result[index])
                        result[index] = alpha;
                }
                else if (alpha > 0) {
                    result[index] = Math.round(result[index] * (255 - alpha) / 255);
                }
                sx += mapping.xx;
                sy += mapping.yx;
            }
        }
    }
    return result;
}
/** Apply local strength without altering alpha or hidden transparent RGB. */
export function blendMaskedPixels(pixels, red, green, blue, coverageBytes) {
    if (pixels.length !== coverageBytes.length * 4) {
        throw new ProInputError("Mask and RGBA buffers have different dimensions");
    }
    for (let pixel = 0, offset = 0; pixel < coverageBytes.length; pixel++, offset += 4) {
        const alpha = coverageBytes[pixel];
        if (alpha === 0 || pixels[offset + 3] === 0)
            continue;
        if (alpha === 255) {
            pixels[offset] = red[pixels[offset]];
            pixels[offset + 1] = green[pixels[offset + 1]];
            pixels[offset + 2] = blue[pixels[offset + 2]];
            continue;
        }
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        pixels[offset] = r + Math.round((red[r] - r) * alpha / 255);
        pixels[offset + 1] = g + Math.round((green[g] - g) * alpha / 255);
        pixels[offset + 2] = b + Math.round((blue[b] - b) * alpha / 255);
    }
}
//# sourceMappingURL=masks.js.map