/** Local frame encoder. No original encoded EXIF/metadata enters this path.
 * The encoder draws its label over final pixels before encoding the frame.
 * The full video engine and its track scheduling are intentionally out of scope.
 */
import { canvasEncoder } from "../save/export.js";
import { scrubEncodedBlob } from "../pro/export-privacy.js";
import { guardFacePixels } from "../pro/identity.js";
import { validateLevel } from "../pro/strength.js";
function checkFrame(frame) {
    if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
        frame.width < 1 || frame.height < 1 || frame.width * frame.height > 12_000_000 ||
        !(frame.data instanceof Uint8ClampedArray) || frame.data.length !== frame.width * frame.height * 4) {
        throw new RangeError("Invalid reel RGBA frame");
    }
}
/** Public frame export; a mocked encoder must still create valid JPEG/PNG bytes.
 * Metadata cleaning is applied after the image encoder returns.
 */
export async function exportReelFrame(frame, settings = {}, encoder = canvasEncoder()) {
    checkFrame(frame);
    const type = settings.mime ?? "image/jpeg";
    const quality = settings.quality ?? 0.92;
    if (!Number.isFinite(quality) || quality <= 0 || quality > 1)
        throw new RangeError("Invalid frame quality");
    if (settings.simulationLabel !== undefined && typeof settings.simulationLabel !== "boolean") {
        throw new RangeError("Invalid simulation label switch");
    }
    const label = settings.simulationLabel === false ? null : "Simulation";
    const input = { width: frame.width, height: frame.height, data: frame.data.slice() };
    const raw = await encoder.encode(input, { type, quality, label });
    if (!(raw instanceof Uint8Array))
        throw new RangeError("Encoder did not return bytes");
    const owned = new Uint8Array(new ArrayBuffer(raw.byteLength));
    owned.set(raw);
    const scrubbed = await scrubEncodedBlob(new Blob([owned.buffer], { type }), type);
    return { blob: scrubbed, label, width: frame.width, height: frame.height };
}
/** Gate the final edited face frame *before* rendering it to a clip canvas.
 * A source frame that was not edited should take the recorder's unedited route.
 */
export async function prepareEditedReelFrame(before, after, faceMask, guard, lockLevel = 5.0) {
    checkFrame(before);
    checkFrame(after);
    validateLevel(lockLevel);
    if (before.width !== after.width || before.height !== after.height) {
        throw new RangeError("Edited frame dimensions changed");
    }
    const result = await guardFacePixels(before.data, after.data, before.width, before.height, faceMask, guard, lockLevel);
    return { width: before.width, height: before.height, data: result.pixels };
}
