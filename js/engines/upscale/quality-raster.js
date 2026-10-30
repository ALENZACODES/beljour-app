export const MAX_RASTER_SIDE = 16_384;
export class RasterRefused extends RangeError {
    constructor(message) {
        super(message);
        this.name = "RasterRefused";
    }
}
/** Shape check; with `opaque`, every alpha value must be 255. */
export function checkedRaster(raster, options = {}) {
    if (!raster || typeof raster !== "object")
        throw new RasterRefused("An RGBA raster is required");
    const { width, height, data } = raster;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > MAX_RASTER_SIDE || height > MAX_RASTER_SIDE) {
        throw new RasterRefused("Raster dimensions are outside the supported range");
    }
    if (!(data instanceof Uint8ClampedArray || data instanceof Uint8Array) || data.length !== width * height * 4) {
        throw new RasterRefused("Raster bytes do not match its dimensions");
    }
    if (options.opaque) {
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 255)
                throw new RasterRefused("An opaque raster has transparent pixels");
        }
    }
    return raster;
}
export function copyRaster(raster) {
    checkedRaster(raster);
    return { width: raster.width, height: raster.height, data: new Uint8ClampedArray(raster.data) };
}
export function wipe(...rasters) {
    for (const raster of rasters)
        raster?.data.fill(0);
}
/** Run `use` on an owned copy and zero the copy afterwards, whatever happens. */
export async function withTemporary(raster, use) {
    try {
        return await use(raster);
    }
    finally {
        wipe(raster);
    }
}
/** Rec. 601 luminance as float32, one value per pixel. */
export function lumaPlane(raster) {
    const pixels = raster.width * raster.height;
    const luma = new Float32Array(pixels);
    for (let p = 0; p < pixels; p++) {
        luma[p] = 0.299 * raster.data[p * 4] + 0.587 * raster.data[p * 4 + 1] + 0.114 * raster.data[p * 4 + 2];
    }
    return luma;
}
export function throwIfAborted(signal) {
    if (signal?.aborted)
        throw new DOMException("Quality job cancelled", "AbortError");
}
//# sourceMappingURL=quality-raster.js.map