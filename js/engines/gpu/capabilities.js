/** Browser capability checks (free-library plan §4D: the Animal Sniffer role, done at run time).
 * A build target says nothing about the phone in a judge's hand, so the editor asks the
 * device: is WebGL2 there, how large can a texture be, can it render to half-float targets?
 * The answer picks the GPU path, the GPU path with tiles, or the CPU reference path, with
 * plain reasons. Nothing is sent anywhere; this runs on the device. Author: John Khan.
 */
import { GL } from "./gl.js";
/** Below this, a GPU is not worth the setup cost or is too limited for a 12 MP export. */
export const MIN_TEXTURE_SIZE = 2048;
/** Probe a context (or null when none could be created) for an image of the given size. */
export function probe(gl, image) {
    const reasons = [];
    if (!gl) {
        reasons.push("WebGL2 is not available in this browser, so edits use the slower on-device CPU path.");
        return { webgl2: false, contextLost: false, maxTextureSize: 0, floatRender: false, targetFormat: "rgba8", path: "cpu", tile: 0, reasons };
    }
    if (gl.isContextLost()) {
        reasons.push("The graphics context was lost; edits use the CPU path until it is restored.");
        return { webgl2: true, contextLost: true, maxTextureSize: 0, floatRender: false, targetFormat: "rgba8", path: "cpu", tile: 0, reasons };
    }
    const rawMax = Number(gl.getParameter(GL.MAX_TEXTURE_SIZE));
    const maxTextureSize = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : 0;
    const floatRender = gl.getExtension("EXT_color_buffer_float") != null;
    const targetFormat = floatRender ? "rgba16f" : "rgba8";
    if (!floatRender)
        reasons.push("Half-float render targets are missing; each pass rounds to 8 bits.");
    if (maxTextureSize < MIN_TEXTURE_SIZE) {
        reasons.push(`The GPU's largest texture is ${maxTextureSize}px (under ${MIN_TEXTURE_SIZE}px), so edits use the CPU path.`);
        return { webgl2: true, contextLost: false, maxTextureSize, floatRender, targetFormat, path: "cpu", tile: 0, reasons };
    }
    if (image) {
        if (!(image.width > 0 && image.height > 0))
            throw new RangeError("image size must be positive");
        if (Math.max(image.width, image.height) > maxTextureSize) {
            const tile = Math.min(maxTextureSize, 2048);
            reasons.push(`The photo is larger than one GPU texture (${maxTextureSize}px); it is rendered in ${tile}px tiles.`);
            return { webgl2: true, contextLost: false, maxTextureSize, floatRender, targetFormat, path: "gpu-tiled", tile, reasons };
        }
    }
    return { webgl2: true, contextLost: false, maxTextureSize, floatRender, targetFormat, path: "gpu", tile: 0, reasons };
}
/** Per-pass tolerance against the CPU reference for the chosen target format. */
export function tolerance(caps, passes) {
    const perPass = caps.targetFormat === "rgba16f" ? 1 / 1024 : 1 / 255;
    return Math.max(1, passes) * perPass + 1 / 255;
}
//# sourceMappingURL=capabilities.js.map