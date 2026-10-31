/** Browser bridge for the mask-limited tonal short-sides engine.
 * The caller explicitly supplies its cleared mask and landmarks; no hidden model
 * downloads, tracking or YouCam calls. The output retains a visible simulation label.
 * Author: John Khan.
 */
import { renderStyle, validatePresets } from "./render.js";
export async function availablePresets() {
    // Embedded by the static build from the one author-owned Python source file.
    // This prevents a catalogue fetch or a photo upload on a local-only page.
    const element = document.getElementById("menshair-presets-data");
    const embedded = element?.textContent;
    if (!embedded || embedded.length > 2_000_000) {
        throw Error("The original local haircut catalogue was not included in this page.");
    }
    const raw = JSON.parse(embedded);
    validatePresets(raw);
    return raw;
}
export function renderCanvasStyle(input, mask, anchors, recipe, scalpMask = null) {
    const source = input.getContext("2d", { willReadFrequently: true });
    if (!source)
        throw Error("The source canvas is unavailable.");
    const image = source.getImageData(0, 0, input.width, input.height);
    const effect = renderStyle(image.data, image.width, image.height, mask, anchors, recipe, scalpMask);
    const output = document.createElement("canvas");
    output.width = input.width;
    output.height = input.height;
    const context = output.getContext("2d");
    if (!context)
        throw Error("The browser cannot display a local hairstyle.");
    context.putImageData(new ImageData(new Uint8ClampedArray(effect.pixels), image.width, image.height), 0, 0);
    return output;
}
