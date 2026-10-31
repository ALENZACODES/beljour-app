import { canvasEncoder } from "../save/export.js";
import { scrubEncodedBlob } from "../pro/export-privacy.js";
import { SIMULATION_LABEL } from "../engines/local/posture.js";
export const MAX_POSTURE_PIXELS = 12_000_000;
export const DEFAULT_QUALITY = 0.92;
function validatedRgba(image) {
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) ||
        image.width <= 0 || image.height <= 0 || image.width * image.height > MAX_POSTURE_PIXELS ||
        (image.channels !== 3 && image.channels !== 4) ||
        image.data.length !== image.width * image.height * image.channels) {
        throw new RangeError("Invalid or oversized posture image");
    }
    const owned = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0, j = 0; i < image.data.length; i += image.channels, j += 4) {
        owned[j] = image.data[i];
        owned[j + 1] = image.data[i + 1];
        owned[j + 2] = image.data[i + 2];
        owned[j + 3] = image.channels === 4 ? image.data[i + 3] : 255;
    }
    return owned;
}
export async function exportPostureImage(result, id, settings = {}, encoder = canvasEncoder()) {
    if (result.label !== SIMULATION_LABEL || !["J10", "J11", "J12", "J13", "J14", "J15", "J16"].includes(id)) {
        throw new RangeError("Posture export needs a labelled, guarded edit and a known fix");
    }
    if (!Number.isFinite(result.lockLevel) || result.lockLevel < 1 || result.lockLevel > 5) {
        throw new RangeError("Posture export has an invalid lock level");
    }
    const { mime = "image/jpeg", quality = DEFAULT_QUALITY, simulationLabel = true } = settings;
    if (mime !== "image/jpeg" && mime !== "image/png")
        throw new RangeError("Unsupported image format");
    if (!Number.isFinite(quality) || quality <= 0 || quality > 1)
        throw new RangeError("Invalid export quality");
    if (typeof simulationLabel !== "boolean")
        throw new RangeError("Invalid simulation label switch");
    const image = result.image;
    const pixels = validatedRgba(image);
    const label = simulationLabel ? SIMULATION_LABEL : null;
    const raw = await encoder.encode({ width: image.width, height: image.height, data: pixels }, { type: mime, quality, label });
    if (!(raw instanceof Uint8Array))
        throw new RangeError("Encoder returned invalid pixels");
    const owned = new Uint8Array(new ArrayBuffer(raw.byteLength));
    owned.set(raw);
    const blob = await scrubEncodedBlob(new Blob([owned.buffer], { type: mime }), mime);
    return { blob, label, mime, name: `Posture_${id}.${mime === "image/png" ? "png" : "jpg"}`,
        width: image.width, height: image.height };
}
