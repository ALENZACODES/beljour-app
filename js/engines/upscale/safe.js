/** Guarded 2x/4x browser upscale with a face-selection identity lock.
 * Mirrors api/plumb_api/engines/upscale/safe.py. Each tile is rendered twice by
 * the existing classical engine: at the requested detail and at its lowest
 * detail (the low-detail source reference). Inside the confirmed face selection
 * RGB is blended toward the reference with integer weights; the full 5.0 lock at
 * full coverage returns the reference exactly. Outside the selection RGB is the
 * detailed engine output. Alpha always follows the reference. The selection is
 * required: a confirmed mask, or a confirmed "no face" declaration. A pixel guard
 * inside a caller-supplied region, not biometric identity verification.
 * No neural weights, no network. Author: John Khan.
 */
import { upscale } from "./index.js";
import { legacyAmount, validateLevel } from "../../pro/strength.js";
import { DEFAULT_BUDGET_BYTES, admit, allocationTiles, } from "./safe-tile-policy.js";
export const SAFE_LABEL = "Classical upscale, no neural weights. Face pixels are locked toward the " +
    "source reference; this is a pixel guard, not identity verification.";
export const FULL_COVERAGE = 255;
const DENOMINATOR = FULL_COVERAGE * 50;
export class SelectionRequired extends RangeError {
}
/** Lock tenths 10..50; the reference share is tenths / 50 (1.0 keeps 20%).
 * ASSUMED: a lowered lock never removes protection entirely. */
export function referenceShareTenths(lockLevel) {
    return Math.round(validateLevel(lockLevel) * 10);
}
export function checkedPhoto(photo) {
    if (!photo || (photo.channels !== 3 && photo.channels !== 4) || !(photo.data instanceof Uint8ClampedArray) ||
        !Number.isInteger(photo.width) || !Number.isInteger(photo.height) ||
        photo.data.length !== photo.width * photo.height * photo.channels) {
        throw new RangeError("Guarded upscale expects an RGB or RGBA photo");
    }
    return photo;
}
export function checkedSelection(selection, width, height) {
    if (!selection || typeof selection !== "object") {
        throw new SelectionRequired("A confirmed face selection is required");
    }
    const { mask, confirmed, noFace = false } = selection;
    if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
        throw new SelectionRequired("Face selection must be a byte mask matching the source");
    }
    if (confirmed !== true)
        throw new SelectionRequired("The face selection must be confirmed by the user");
    if (typeof noFace !== "boolean")
        throw new SelectionRequired("Invalid no-face declaration");
    const marked = mask.some(value => value !== 0);
    if (marked && noFace)
        throw new SelectionRequired("A marked face contradicts the no-face declaration");
    if (!marked && !noFace) {
        throw new SelectionRequired("An empty selection needs an explicit no-face declaration");
    }
    return mask;
}
function readRegion(photo, tile) {
    const width = tile.readX1 - tile.readX0;
    const height = tile.readY1 - tile.readY0;
    const rowBytes = width * photo.channels;
    const data = new Uint8ClampedArray(rowBytes * height);
    for (let row = 0; row < height; row++) {
        const from = ((tile.readY0 + row) * photo.width + tile.readX0) * photo.channels;
        data.set(photo.data.subarray(from, from + rowBytes), row * rowBytes);
    }
    return { width, height, channels: photo.channels, data };
}
export function renderLayers(photo, tile, scale, detail) {
    const region = readRegion(photo, tile);
    if (region.width < 8 || region.height < 8)
        throw new RangeError("Tile read region is too small");
    return {
        engine: upscale(region, scale, detail),
        reference: upscale(region, scale, 0),
        left: (tile.x0 - tile.readX0) * scale,
        top: (tile.y0 - tile.readY0) * scale,
    };
}
/** Integer blend of one output pixel's RGB toward the reference. */
export function blendValue(engine, reference, coverage, tenths) {
    const weight = coverage * tenths;
    return Math.floor((engine * (DENOMINATOR - weight) + reference * weight + DENOMINATOR / 2) / DENOMINATOR);
}
/** Visit every output pixel of a tile core with its layers' offsets and coverage. */
export function forEachCorePixel(photo, mask, tile, scale, layers, visit) {
    const outputWidth = photo.width * scale;
    const channels = photo.channels;
    for (let y = tile.y0 * scale; y < tile.y1 * scale; y++) {
        const maskRow = Math.floor(y / scale) * photo.width;
        const layerRow = (y - tile.y0 * scale + layers.top) * layers.engine.width;
        for (let x = tile.x0 * scale; x < tile.x1 * scale; x++) {
            const layerPixel = layerRow + x - tile.x0 * scale + layers.left;
            visit((y * outputWidth + x) * channels, layerPixel * channels, mask[maskRow + Math.floor(x / scale)]);
        }
    }
}
export function safeUpscale(photo, selection, options = {}) {
    const source = checkedPhoto(photo);
    const mask = checkedSelection(selection, source.width, source.height);
    const { scale = 2, detailLevel = 3.0, lockLevel = 5.0, budgetBytes = DEFAULT_BUDGET_BYTES, release = true } = options;
    const detail = legacyAmount(validateLevel(detailLevel));
    const tenths = referenceShareTenths(lockLevel);
    if (typeof release !== "boolean")
        throw new RangeError("release must be a boolean");
    const allocation = admit(source.width, source.height, { channels: source.channels, scale, budgetBytes });
    const data = new Uint8ClampedArray(allocation.outputBytes);
    const channels = source.channels;
    for (const tile of allocationTiles(allocation)) {
        const layers = renderLayers(source, tile, scale, detail);
        const engine = layers.engine.data;
        const reference = layers.reference.data;
        forEachCorePixel(source, mask, tile, scale, layers, (out, at, coverage) => {
            for (let channel = 0; channel < 3; channel++) {
                data[out + channel] = coverage === 0 ? engine[at + channel]
                    : blendValue(engine[at + channel], reference[at + channel], coverage, tenths);
            }
            if (channels === 4)
                data[out + 3] = reference[at + 3];
        });
    }
    let facePixels = 0;
    for (const value of mask)
        if (value !== 0)
            facePixels += 1;
    return Object.freeze({
        photo: { width: source.width * scale, height: source.height * scale, channels, data },
        scale, detailLevel: validateLevel(detailLevel), lockLevel: tenths / 10, facePixels,
        allocation, release, label: SAFE_LABEL,
    });
}
