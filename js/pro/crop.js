/** Precision-oriented crop/rotation geometry, independent of canvas and pixel storage. */
import { ASPECT_RATIOS, ProInputError, checkCrop, requireDimensions } from "./types.js";
function centerFit(rect, aspect) {
    if (aspect === null)
        return rect;
    const midX = rect.x + rect.width / 2;
    const midY = rect.y + rect.height / 2;
    let { width, height } = rect;
    if (width / height > aspect)
        width = height * aspect;
    else
        height = width / aspect;
    return { x: midX - width / 2, y: midY - height / 2, width, height };
}
export function makeCropGeometry(sourceWidth, sourceHeight, crop, maxEdge) {
    requireDimensions(sourceWidth, sourceHeight);
    checkCrop(crop);
    if (maxEdge !== undefined && (!Number.isInteger(maxEdge) || maxEdge < 1 || maxEdge > 16384)) {
        throw new ProInputError("Export edge must be from 1 to 16384");
    }
    const original = {
        x: crop.x * sourceWidth,
        y: crop.y * sourceHeight,
        width: crop.width * sourceWidth,
        height: crop.height * sourceHeight,
    };
    const ratio = crop.aspect === "original" ? original.width / original.height : ASPECT_RATIOS[crop.aspect];
    const rect = centerFit(original, ratio);
    const radians = (crop.rotation * Math.PI) / 180;
    const sine = Math.abs(Math.sin(radians));
    const cosine = Math.abs(Math.cos(radians));
    const projectedWidth = rect.width * cosine + rect.height * sine;
    const projectedHeight = rect.width * sine + rect.height * cosine;
    const boundWidth = Math.max(1, Math.ceil(projectedWidth - 1e-9));
    const boundHeight = Math.max(1, Math.ceil(projectedHeight - 1e-9));
    let scale = 1;
    if (maxEdge !== undefined)
        scale = Math.min(scale, maxEdge / Math.max(boundWidth, boundHeight));
    scale = Math.min(scale, Math.sqrt(12_000_000 / (boundWidth * boundHeight)));
    const width = Math.max(1, Math.floor(boundWidth * scale));
    const height = Math.max(1, Math.floor(boundHeight * scale));
    return { rect, rotation: crop.rotation, projectedWidth, projectedHeight, width, height, radians };
}
export function inversePixel(geometry, x, y) {
    const offsetX = (x + 0.5 - geometry.width / 2) * geometry.projectedWidth / geometry.width;
    const offsetY = (y + 0.5 - geometry.height / 2) * geometry.projectedHeight / geometry.height;
    const cosine = Math.cos(geometry.radians);
    const sine = Math.sin(geometry.radians);
    return [
        geometry.rect.x + geometry.rect.width / 2 + offsetX * cosine + offsetY * sine,
        geometry.rect.y + geometry.rect.height / 2 - offsetX * sine + offsetY * cosine,
    ];
}
export function insideCrop(geometry, x, y) {
    const { rect } = geometry;
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
export function previewGeometry(geometry, maxEdge = 640) {
    if (!Number.isInteger(maxEdge) || maxEdge < 64 || maxEdge > 2048) {
        throw new ProInputError("Preview edge must be between 64 and 2048");
    }
    const scale = Math.min(1, maxEdge / Math.max(geometry.width, geometry.height));
    return {
        ...geometry,
        width: Math.max(1, Math.floor(geometry.width * scale)),
        height: Math.max(1, Math.floor(geometry.height * scale)),
    };
}
//# sourceMappingURL=crop.js.map