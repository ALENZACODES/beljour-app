/** E07 part 2: the gate between a learned fill model and the network.
 *
 * A session is created only when (1) the E03 registry approves the model (commercial
 * licence cleared, exact sha256 and size pinned), (2) its bytes arrive through the
 * registry's verified download, and (3) an ONNX runtime has been injected. Nothing here
 * imports onnxruntime-web or names a download URL: the runtime is passed in by the
 * caller once John clears it, so a pending model can never reach fetch().
 * Author: John Khan.
 */
import { DEFAULT_MODELS, ModelDownloads } from "../../../vision/model-registry.js";
export class LearnedModelUnavailable extends Error {
    constructor(message) { super(message); this.name = "LearnedModelUnavailable"; }
}
/** A plain tensor for runtimes and tests that accept {type, data, dims}. */
export function plainTensor(type, data, dims) {
    const count = dims.reduce((a, b) => a * b, 1);
    if (!dims.every((d) => Number.isInteger(d) && d > 0) || count !== data.length)
        throw new RangeError("tensor dims do not match its data");
    if ((type === "uint8") !== (data instanceof Uint8Array))
        throw new RangeError("tensor type does not match its data");
    return { type, data, dims: [...dims] };
}
export class SessionLoader {
    modelId;
    registry;
    downloads;
    ort;
    session = null;
    constructor({ modelId, registry = DEFAULT_MODELS, ort = null, fetcher }) {
        this.modelId = modelId;
        this.registry = registry;
        this.ort = ort;
        this.downloads = new ModelDownloads(registry, fetcher);
        registry.get(modelId); // unknown ids fail at construction
    }
    /** Whether a fill could run now, and in plain words why not. Never touches the network. */
    status() {
        const model = this.registry.get(this.modelId);
        if (!this.registry.ready(this.modelId)) {
            return { ready: false, reason: `model ${this.modelId} is ${model.status}: licence or pin not cleared` };
        }
        if (!this.ort)
            return { ready: false, reason: "no ONNX runtime has been loaded" };
        return { ready: true, reason: "ready" };
    }
    attachRuntime(ort) { this.ort = ort; this.session = null; }
    /** Approve, download (verified), then create the session; cached after the first success. */
    load(signal) {
        const state = this.status();
        if (!state.ready)
            return Promise.reject(new LearnedModelUnavailable(state.reason));
        if (!this.session) {
            const ort = this.ort;
            this.session = this.downloads.load(this.modelId, signal).then((bytes) => ort.createSession(bytes)).catch((error) => {
                this.session = null;
                throw error;
            });
        }
        return this.session;
    }
    async reset() {
        const pending = this.session;
        this.session = null;
        this.downloads.clear();
        if (pending) {
            try {
                await (await pending).release?.();
            }
            catch { /* a failed load has nothing to release */ }
        }
    }
}
//# sourceMappingURL=runtime.js.map