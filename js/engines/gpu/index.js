/** GPU module entry: pick the backend the device can actually run (plan §5 "Recover honestly").
 * GPU when WebGL2 is healthy, tiles when the photo outgrows one texture, the CPU reference
 * otherwise. Every choice comes with the plain reasons from `probe`. Author: John Khan.
 */
import { probe } from "./capabilities.js";
import { CpuBackend, Pipeline, WebGL2Backend } from "./pipeline.js";
export { probe } from "./capabilities.js";
export { Device, CONTEXT_ATTRIBUTES } from "./device.js";
export { Pipeline, CpuBackend, WebGL2Backend, RenderAborted } from "./pipeline.js";
export { ResourcePool } from "./resources.js";
export function chooseRenderer(device, image) {
    const gl = device?.gl ?? null;
    const capabilities = probe(gl, image);
    const backend = capabilities.path !== "cpu" && gl && device
        ? new WebGL2Backend(gl, capabilities.targetFormat, device.pool)
        : new CpuBackend();
    return { pipeline: new Pipeline(backend), capabilities, backend };
}
//# sourceMappingURL=index.js.map