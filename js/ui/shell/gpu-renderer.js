import { requireColour } from "../../engines/core/buffer.js";
import { Device } from "../../engines/gpu/device.js";
import { probe } from "../../engines/gpu/capabilities.js";
import { Pipeline, WebGL2Backend } from "../../engines/gpu/pipeline.js";
import { fromBytes, toBytes } from "../../engines/gpu/shaders/ops.js";
import { appearanceMatrix, preset, relightImage, LABEL } from "../../engines/shade/lighting.js";
import { matmul, RGB_TO_XYZ, XYZ_TO_RGB } from "../../engines/shade/colourspace.js";
/** Exact W98 RGB transform; no duplicate illuminant tables or approximate preset. */
export function lightingStep(presetId) {
    const matrix = matmul(matmul(XYZ_TO_RGB, appearanceMatrix(preset(presetId))), RGB_TO_XYZ);
    const params = {};
    for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++)
            params[`m${row}${col}`] = matrix[row][col];
    return { op: "matrix", params };
}
function rgba(image) {
    const data = new Uint8Array(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i++) {
        for (let c = 0; c < 3; c++)
            data[4 * i + c] = image.data[image.channels * i + c];
        data[4 * i + 3] = image.channels === 4 ? image.data[4 * i + 3] : 255;
    }
    return data;
}
function fromRgba(bytes, image) {
    if (image.channels === 4)
        return { ...image, data: Uint8Array.from(bytes) };
    const data = new Uint8Array(image.width * image.height * 3);
    for (let i = 0; i < image.width * image.height; i++)
        data.set(bytes.subarray(i * 4, i * 4 + 3), i * 3);
    return { ...image, data };
}
export class ShellGpuRenderer {
    device;
    pipeline = null;
    pipelineGeneration = -1;
    disposed = false;
    unsubscribe;
    revision = 0;
    failedGeneration = null;
    constructor(canvas) {
        this.device = canvas ? new Device(canvas) : null;
        this.unsubscribe = this.device?.subscribe(() => { this.pipeline?.dispose(); this.pipeline = null; }) ?? null;
    }
    get generation() { return this.device ? this.device.generation * 10 + (this.device.state === "ready" ? 1 : 0) : 0; }
    capabilities(image) { return probe(this.device?.gl ?? null, image); }
    cpu(image, presetId, reason) {
        return { image: { ...image, data: Uint8Array.from(relightImage(image, presetId)) }, label: LABEL,
            metrics: { lighting: presetId, backend: "cpu", render_reason: reason } };
    }
    render(image, presetId) {
        if (this.disposed)
            throw new Error("The shell renderer has been closed.");
        requireColour(image);
        preset(presetId);
        // Daylight is the identity and avoids an unnecessary GPU upload/readback.
        if (presetId === "daylight")
            return { image: { ...image, data: Uint8Array.from(image.data) }, label: LABEL,
                metrics: { lighting: presetId, backend: "identity", render_reason: "Daylight keeps the source colour values." } };
        const caps = this.capabilities(image);
        if (caps.path === "cpu" || this.failedGeneration === this.device?.generation) {
            return this.cpu(image, presetId, caps.reasons.join(" ") || "The graphics path is unavailable for this session.");
        }
        const device = this.device;
        try {
            if (!this.pipeline || this.pipelineGeneration !== device.generation) {
                this.pipeline?.dispose();
                this.pipeline = new Pipeline(new WebGL2Backend(device.gl, caps.targetFormat, device.pool));
                this.pipelineGeneration = device.generation;
            }
            const input = fromBytes(image.width, image.height, rgba(image));
            const steps = [lightingStep(presetId)], options = { revision: ++this.revision };
            const result = caps.path === "gpu-tiled" ? this.pipeline.renderTiled(input, steps, caps.tile, options)
                : this.pipeline.render(input, steps, options);
            if (!device.gl)
                throw new Error("The graphics context was lost.");
            return { image: fromRgba(toBytes(result.image), image), label: LABEL,
                metrics: { lighting: presetId, backend: "webgl2", passes: result.passes, tiled: caps.path === "gpu-tiled", target: caps.targetFormat } };
        }
        catch {
            this.failedGeneration = device.generation;
            this.pipeline?.dispose();
            this.pipeline = null;
            // A GPU error never replaces or clears the original photo.
            return this.cpu(image, presetId, "The graphics render could not finish. This preview was rendered on the device CPU.");
        }
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.unsubscribe?.();
        this.pipeline?.dispose();
        this.pipeline = null;
        this.device?.dispose();
    }
}
/** Called once by the editor, not at module import; also works in a worker. */
export function browserShellRenderer() {
    let canvas = null;
    try {
        if (typeof OffscreenCanvas !== "undefined")
            canvas = new OffscreenCanvas(1, 1);
        else if (typeof document !== "undefined")
            canvas = document.createElement("canvas");
    }
    catch {
        canvas = null;
    }
    return new ShellGpuRenderer(canvas);
}
//# sourceMappingURL=gpu-renderer.js.map