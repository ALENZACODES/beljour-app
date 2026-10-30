import { ResourcePool } from "./resources.js";
export const CONTEXT_ATTRIBUTES = Object.freeze({
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: false, powerPreference: "default", failIfMajorPerformanceCaveat: false,
});
export class Device {
    canvas;
    pool = new ResourcePool();
    glRef;
    stateRef;
    listeners = new Set();
    generationRef = 0;
    onLost = (event) => {
        event.preventDefault?.();
        this.pool.forgetAll();
        this.set("lost");
    };
    onRestored = () => {
        this.glRef = this.canvas.getContext("webgl2", CONTEXT_ATTRIBUTES) ?? null;
        this.generationRef++;
        this.set(this.glRef ? "ready" : "unavailable");
    };
    constructor(canvas) {
        this.canvas = canvas;
        let gl = null;
        try {
            gl = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES) ?? null;
        }
        catch {
            gl = null;
        }
        this.glRef = gl;
        this.stateRef = gl ? "ready" : "unavailable";
        canvas.addEventListener("webglcontextlost", this.onLost);
        canvas.addEventListener("webglcontextrestored", this.onRestored);
    }
    /** The live context, or null when lost, unavailable or disposed. */
    get gl() {
        if (this.stateRef !== "ready" || !this.glRef || this.glRef.isContextLost())
            return null;
        return this.glRef;
    }
    get state() { return this.stateRef; }
    /** Bumps on every restore, so cached programs know they belong to a dead context. */
    get generation() { return this.generationRef; }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    set(state) {
        this.stateRef = state;
        for (const listener of [...this.listeners])
            listener(state);
    }
    dispose() {
        if (this.stateRef === "disposed")
            return;
        if (this.stateRef === "ready")
            this.pool.dispose();
        else
            this.pool.forgetAll();
        this.canvas.removeEventListener("webglcontextlost", this.onLost);
        this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
        this.glRef = null;
        this.set("disposed");
        this.listeners.clear();
    }
}
//# sourceMappingURL=device.js.map