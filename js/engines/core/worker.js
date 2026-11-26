/**
 * Web Worker entry for the local engines: `new Worker("js/engines/core/worker.js", {type: "module"})`.
 * Registers reference engines, E06/E07 (R5) and E08 face shape (R6); future rounds add theirs
 * to `defaultRegistry`.
 * The worker never fetches anything and never talks to YouCam.
 *
 * Author: John Khan.
 */
import { ShapeEngine } from "../shape/geometry.js";
import { FillEngine } from "../fill/fill.js";
import { WarpEngine } from "../warp/engine.js";
import { ExposureEngine, TintEngine } from "./engine.js";
import { EngineRegistry, serve } from "./jobs.js";
export function defaultRegistry() {
    return new EngineRegistry()
        .register("exposure", () => new ExposureEngine())
        .register("tint", () => new TintEngine())
        .register("warp", () => new WarpEngine())
        .register("fill", () => new FillEngine())
        .register("shape", () => new ShapeEngine());
}
/** True inside a worker: the global object is a WorkerGlobalScope (never in a page or in Node). */
function inWorker(scope) {
    const ctor = scope.WorkerGlobalScope;
    return typeof ctor === "function" && scope instanceof ctor;
}
const scope = globalThis;
if (inWorker(scope))
    scope.addEventListener("message", serve(defaultRegistry(), scope));
//# sourceMappingURL=worker.js.map