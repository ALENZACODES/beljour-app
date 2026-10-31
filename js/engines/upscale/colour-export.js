/** Pre-encoder pixel integrity for local upscale exports.
 * JPEG has no alpha channel, so every pixel is composited over a white matte
 * here, with integer arithmetic that returns a fully opaque pixel's RGB
 * unchanged. Thin, fully opaque product strokes (a lip line, a brow hair) keep
 * their exact colour rather than whatever a canvas does with alpha. For PNG the
 * alpha is kept, and the RGB under fully transparent pixels is cleared so colour
 * from removed or hidden content cannot travel in the file. Encoding then goes
 * through the existing local encoder, which burns in the Simulation label by
 * default, and the existing metadata scrub. This is about the pixels handed to
 * the encoder; JPEG compression itself is still lossy. No upload, no network.
 * Author: John Khan.
 */
import { canvasEncoder } from "../../save/export.js";
import { scrubEncodedBlob } from "../../pro/export-privacy.js";
export const EXPORT_LABEL = "Simulation";
export const WHITE_MATTE = 255;
/** The 16 MP output ceiling of the HD/4K quality tiers (r37e); a 3840 x 3840
 * square 4K frame is 14.7 MP. */
export const MAX_EXPORT_PIXELS = 16_000_000;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
function checkedRaster(raster) {
    const { width, height, data } = raster ?? {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_EXPORT_PIXELS ||
        !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
        data.length !== width * height * 4) {
        throw new RangeError("Export needs an RGBA image within the local size limit");
    }
}
/** Composite over white: out = (c * a + 255 * (255 - a)) / 255, rounded half up.
 * a = 255 returns c exactly and a = 0 returns pure white. */
export function jpegEncoderInput(raster) {
    checkedRaster(raster);
    const source = raster.data;
    const output = new Uint8ClampedArray(source.length);
    for (let i = 0; i < source.length; i += 4) {
        const alpha = source[i + 3];
        const cover = WHITE_MATTE * (255 - alpha);
        for (let channel = 0; channel < 3; channel += 1) {
            output[i + channel] = Math.floor((source[i + channel] * alpha + cover + 127) / 255);
        }
        output[i + 3] = 255;
    }
    return output;
}
/** Keep alpha and visible colour; zero the RGB of fully transparent pixels. */
export function pngEncoderInput(raster) {
    checkedRaster(raster);
    const output = new Uint8ClampedArray(raster.data);
    for (let i = 3; i < output.length; i += 4) {
        if (output[i] === 0)
            output.fill(0, i - 3, i);
    }
    return output;
}
export function encoderInput(raster, mime) {
    if (mime === "image/jpeg")
        return jpegEncoderInput(raster);
    if (mime === "image/png")
        return pngEncoderInput(raster);
    throw new RangeError("Unsupported image format");
}
export async function exportColourSafe(raster, name, settings = {}, encoder = canvasEncoder()) {
    const { mime = "image/jpeg", quality = 0.92, simulationLabel = true } = settings;
    if (typeof name !== "string" || !NAME.test(name))
        throw new RangeError("Invalid export name");
    if (!Number.isFinite(quality) || quality <= 0 || quality > 1)
        throw new RangeError("Invalid export quality");
    if (typeof simulationLabel !== "boolean")
        throw new RangeError("Invalid simulation label switch");
    const pixels = encoderInput(raster, mime);
    const label = simulationLabel ? EXPORT_LABEL : null;
    const encoded = await encoder.encode({ width: raster.width, height: raster.height, data: pixels }, { type: mime, quality, label });
    if (!(encoded instanceof Uint8Array) || encoded.byteLength === 0) {
        throw new RangeError("Encoder returned no image");
    }
    const owned = new Uint8Array(new ArrayBuffer(encoded.byteLength));
    owned.set(encoded);
    const blob = await scrubEncodedBlob(new Blob([owned.buffer], { type: mime }), mime);
    return {
        blob, mime, label, width: raster.width, height: raster.height,
        name: `${name}.${mime === "image/png" ? "png" : "jpg"}`,
    };
}
