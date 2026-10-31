/** Bounded ink/oil export, halo correctness and global texture phase. Author: John Khan. */
import { DEFAULTS as inkDefaults, inkStudy } from "./ink.js";
import { DEFAULTS as oilDefaults, pigmentOil } from "./oil.js";
import { DEFAULTS as crownDefaults, renderCrownFrame } from "./crown.js";
import { DEFAULT_BUDGET, exportAllocation } from "./resources.js";
import { EffectUnavailable, MAX_SIDE, integer, landmarks, parameters, photo } from "./types.js";
export const MAX_EXPORT_PIXELS = 16_777_216;
export const MAX_TILE_SIDE = 1024;
export const MIN_TILE_SIDE = 32;
export class RenderCancelled extends Error {
    constructor() { super("artistic render cancelled"); this.name = "RenderCancelled"; }
}
export function tiles(width, height, tileSize, halo) {
    integer(width, "width", 2, MAX_SIDE);
    integer(height, "height", 2, MAX_SIDE);
    integer(tileSize, "tile_size", MIN_TILE_SIDE, MAX_TILE_SIDE);
    integer(halo, "halo", 0, 12);
    if (width * height > MAX_EXPORT_PIXELS)
        throw new RangeError("artistic export exceeds the 16 MP working limit");
    const plan = [];
    for (let top = 0; top < height; top += tileSize) {
        for (let left = 0; left < width; left += tileSize) {
            const right = Math.min(width, left + tileSize), bottom = Math.min(height, top + tileSize);
            plan.push({ left, top, right, bottom, cropLeft: Math.max(0, left - halo), cropTop: Math.max(0, top - halo),
                cropRight: Math.min(width, right + halo), cropBottom: Math.min(height, bottom + halo) });
        }
    }
    return plan;
}
export function requiredHalo(effectId, params) {
    if (effectId === "ink-study") {
        parameters(params, inkDefaults);
        return 1;
    }
    if (effectId === "pigment-oil") {
        const p = parameters(params, oilDefaults);
        return integer(p.radius, "radius", 1, 12);
    }
    if (effectId === "meadow-crown") {
        parameters(params, crownDefaults);
        return 1;
    }
    throw new EffectUnavailable("not_tileable", "this effect needs the full mesh working frame");
}
function maskView(value, size, name) {
    if (value === undefined || value === null)
        throw new EffectUnavailable(`missing_${name}`, `${name} is required for exact export protection`);
    if (value.length !== size)
        throw new RangeError(`${name} must be a numeric array matching the export`);
    for (let i = 0; i < size; i++) {
        if (typeof value[i] !== "number" || !Number.isFinite(value[i]) || value[i] < 0 || value[i] > 1) {
            throw new RangeError(`${name} must contain finite 0..1 values`);
        }
    }
    return value;
}
function cropPhoto(source, tile) {
    const width = tile.cropRight - tile.cropLeft, height = tile.cropBottom - tile.cropTop;
    const data = new Uint8ClampedArray(width * height * source.channels);
    for (let y = 0; y < height; y++) {
        const start = ((y + tile.cropTop) * source.width + tile.cropLeft) * source.channels;
        data.set(source.data.subarray(start, start + width * source.channels), y * width * source.channels);
    }
    return { width, height, channels: source.channels, data };
}
function cropMask(source, width, tile) {
    const w = tile.cropRight - tile.cropLeft, h = tile.cropBottom - tile.cropTop;
    const out = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++)
            out[y * w + x] = source[(y + tile.cropTop) * width + x + tile.cropLeft];
    }
    return out;
}
export function renderTiled(effectId, image, options = {}) {
    const source = photo(image, MAX_EXPORT_PIXELS), halo = requiredHalo(effectId, options.params);
    const allocation = exportAllocation(effectId, source.width, source.height, source.channels, options.tileSize ?? 512, halo, options.budgetBytes ?? DEFAULT_BUDGET);
    const plan = tiles(source.width, source.height, allocation.tile_size, halo);
    if (options.cancelled?.())
        throw new RenderCancelled();
    const hair = effectId === "ink-study" || effectId === "meadow-crown"
        ? maskView(options.hairMask, source.width * source.height, "hair_mask") : undefined;
    const eyes = effectId === "ink-study" ? maskView(options.eyeMask, source.width * source.height, "eye_mask") : undefined;
    const points = effectId === "meadow-crown" ? landmarks(options.landmarks, source.width, source.height) : undefined;
    const output = new Uint8ClampedArray(source.data.length);
    let maximumWorking = 0, changed = 0, outsideError = 0, alphaSame = true, label = "";
    let visibleAlpha = 0;
    let warnings = [];
    for (const [index, tile] of plan.entries()) {
        if (options.cancelled?.())
            throw new RenderCancelled();
        const block = cropPhoto(source, tile);
        let rendered;
        if (effectId === "ink-study") {
            rendered = inkStudy(block, cropMask(hair, source.width, tile), cropMask(eyes, source.width, tile), options.params);
        }
        else if (effectId === "meadow-crown") {
            const translated = points.map((p) => [p[0] - tile.cropLeft, p[1] - tile.cropTop]);
            rendered = renderCrownFrame(block, translated, cropMask(hair, source.width, tile), options.params);
        }
        else
            rendered = pigmentOil(block, options.params, tile.cropLeft, tile.cropTop);
        for (let y = tile.top; y < tile.bottom; y++) {
            for (let x = tile.left; x < tile.right; x++) {
                const globalPixel = y * source.width + x;
                const localPixel = (y - tile.cropTop) * block.width + x - tile.cropLeft;
                visibleAlpha += rendered.support[localPixel];
                let hasChange = false;
                for (let c = 0; c < source.channels; c++) {
                    const old = source.data[globalPixel * source.channels + c], next = rendered.image[localPixel * source.channels + c];
                    output[globalPixel * source.channels + c] = next;
                    if (c < 3) {
                        const delta = Math.abs(next - old);
                        hasChange ||= delta !== 0;
                        if (rendered.support[localPixel] <= 0)
                            outsideError = Math.max(outsideError, delta);
                    }
                    else if (old !== next)
                        alphaSame = false;
                }
                if (hasChange)
                    changed++;
            }
        }
        maximumWorking = Math.max(maximumWorking, block.width * block.height);
        label = rendered.label;
        warnings = rendered.warnings;
        options.progress?.(index + 1, plan.length);
    }
    if (options.cancelled?.())
        throw new RenderCancelled();
    if (effectId === "meadow-crown") {
        warnings = ["Original procedural artwork; placement depends on your confirmed mesh and hair matte."];
        if (visibleAlpha < 1)
            warnings = [...warnings, "The crown is hidden by the hair mask or outside the photo."];
    }
    return { image: output, effect_id: effectId, label, warnings,
        metrics: { tile_count: plan.length, maximum_working_pixels: maximumWorking, halo,
            changed_pixels: changed, outside_max_error: outsideError, alpha_unchanged: alphaSame,
            visible_alpha_sum: visibleAlpha, allocation_allowance_bytes: allocation.estimated_peak_bytes,
            selected_tile_size: allocation.tile_size } };
}
