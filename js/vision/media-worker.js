/** E05 dedicated module worker. Every MediaPipe task is created only on demand,
 * using bytes whose SHA-256 and commercial licence have been checked first.
 * This worker has no YouCam code or credentials. Author: John Khan.
 */
import { DEFAULT_MODELS, ModelDownloads, siteUrl } from "./model-registry.js";
import { MODEL_RUNTIME } from "./generated/model-runtime.js";
import { requireVisionRequest, transferResponse } from "./protocol.js";
import { MediaPipeRunners, facePipelineAvailability } from "./runners.js";
const SDK_URL = siteUrl(`${MODEL_RUNTIME.baseUrl}/vision_bundle.mjs`);
const WASM_URL = siteUrl(`${MODEL_RUNTIME.baseUrl}/wasm`);
const downloads = new ModelDownloads(DEFAULT_MODELS);
// No cleared YuNet browser runtime or weights are registered in this snapshot.
// Preserve the existing cleared legacy path with explicit result diagnostics.
// An integration requiring P0 box-first must inject its cleared boxSource and
// set requireBoxFirst: true. Model registry checks still apply independently.
const FACE_PIPELINE = { requireBoxFirst: false };
let runners = null;
function modelForTask(operation) {
    switch (operation) {
        case "face-detection": return "face-detector-short";
        case "face-landmarks": return "face-landmarker-478";
        case "pose": return "pose-landmarker-lite";
        case "hair-segmentation": return "hair-segmenter";
        case "person-segmentation": return "selfie-multiclass";
        default: throw new RangeError("unknown vision operation");
    }
}
async function loadSdk() {
    if (!runners)
        runners = (async () => {
            // SDK and WASM are copied from a verified local release cache at build time.
            // Neither code nor weights may cause a third-party browser request.
            const sdk = await import(/* webpackIgnore: true */ SDK_URL);
            if (!sdk?.FilesetResolver || !sdk.FaceLandmarker)
                throw new Error("MediaPipe Tasks Vision is not available");
            return new MediaPipeRunners(sdk, WASM_URL, (name) => downloads.load(name), FACE_PIPELINE);
        })().catch((error) => { runners = null; throw error; });
    return runners;
}
const scope = self;
scope.addEventListener("message", (event) => {
    const incoming = event.data;
    const id = incoming?.id ?? -1;
    const emit = (result) => scope.postMessage(result, transferResponse(result));
    void (async () => {
        try {
            const req = requireVisionRequest(event.data);
            const model = modelForTask(req.operation);
            // The guard happens before dynamic import, WASM resolution and fetch().
            if (!DEFAULT_MODELS.ready(model)) {
                const faceTask = req.operation === "face-detection" || req.operation === "face-landmarks";
                const pipelineReason = faceTask ? facePipelineAvailability(FACE_PIPELINE).reason : null;
                emit({ kind: "result", id: req.id, ok: false, status: "pending",
                    error: `Model ${model} is not cleared for commercial use.${pipelineReason ? ` ${pipelineReason}` : ""} Use manual points or masks.` });
                return;
            }
            // Check staged bytes before importing any SDK. A cleared but unstaged
            // model reports the manual fallback instead of importing a remote runtime.
            await downloads.load(model);
            const runtime = await loadSdk();
            const rgba = new Uint8ClampedArray(req.image.rgba);
            const image = new ImageData(rgba, req.image.width, req.image.height);
            const output = await runtime.run(req.operation, image, req.maxFaces ?? 6);
            emit({ kind: "result", id: req.id, ok: true, output });
        }
        catch (error) {
            emit({ kind: "result", id, ok: false, status: "failed",
                error: error instanceof Error ? error.message : "Vision worker failed" });
        }
    })();
});
