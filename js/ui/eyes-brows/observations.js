/** In-memory manual evidence tools; no face-model substitutions. Author: John Khan. */
import { MAX_TRACES, normalPoint, validateTrace } from "./input.js";
export function canvasPoint(clientX, clientY, rect) {
    if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
        || rect.width <= 0 || rect.height <= 0)
        throw new RangeError("The canvas has no measurable area.");
    return [Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))];
}
/** Coverage compositing makes repeated strokes saturate without exceeding one. */
export function paintDisc(mask, width, height, point, radius, erase = false, hardness = 0.65) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 640 || height > 640
        || mask.length !== width * height)
        throw new RangeError("Hair mask dimensions are invalid.");
    normalPoint(point);
    if (!Number.isFinite(radius) || radius < 1 || radius > 80 || !Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
        throw new RangeError("The brush radius or hardness is outside its supported range.");
    }
    const cx = point[0] * width, cy = point[1] * height;
    const left = Math.max(0, Math.floor(cx - radius)), right = Math.min(width - 1, Math.ceil(cx + radius));
    const top = Math.max(0, Math.floor(cy - radius)), bottom = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
            if (d >= 1)
                continue;
            const alpha = d <= hardness ? 1 : (1 - d) / Math.max(1e-9, 1 - hardness);
            const index = y * width + x;
            mask[index] = erase ? mask[index] * (1 - alpha) : 1 - (1 - mask[index]) * (1 - alpha);
        }
    }
}
export function paintSegment(mask, width, height, start, end, radius, erase = false) {
    normalPoint(start);
    normalPoint(end);
    if (!Number.isFinite(radius) || radius < 1 || radius > 80)
        throw new RangeError("Invalid brush radius.");
    const distance = Math.hypot((end[0] - start[0]) * width, (end[1] - start[1]) * height);
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, radius / 3)));
    for (let index = 0; index <= steps; index++) {
        const t = index / steps;
        paintDisc(mask, width, height, [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])], radius, erase);
    }
}
/** Records only completed strokes. Pointer cancellation cannot silently add a lash. */
export class Observations {
    width;
    height;
    maskValue;
    hairChecked = false;
    tracesValue = [];
    stroke = null;
    constructor(width, height) {
        this.width = width;
        this.height = height;
        if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 1 || Math.max(width, height) > 640) {
            throw new RangeError("Observation dimensions must be within the preview limit.");
        }
        this.maskValue = new Float64Array(width * height);
    }
    get hairDeclared() { return this.hairChecked; }
    get count() { return this.tracesValue.length; }
    get drawing() { return this.stroke !== null; }
    get mask() { return this.maskValue.slice(); }
    get traces() { return this.tracesValue.map(trace => ({ ...trace, points: trace.points.map(point => [...point]) })); }
    declareNoHair() {
        this.cancel();
        this.maskValue.fill(0);
        this.hairChecked = true;
    }
    setHair(mask) {
        if (mask.length !== this.maskValue.length)
            throw new RangeError("Hair mask dimensions differ.");
        const checked = new Float64Array(mask.length);
        for (let index = 0; index < mask.length; index++) {
            if (!Number.isFinite(mask[index]) || mask[index] < 0 || mask[index] > 1)
                throw new RangeError("Hair coverage must be in 0..1.");
            checked[index] = mask[index];
        }
        this.cancel();
        this.maskValue = checked;
        this.hairChecked = true;
    }
    setTraces(values) {
        if (values.length > MAX_TRACES)
            throw new RangeError("Too many lash traces.");
        const checked = values.map(validateTrace);
        this.cancel();
        this.tracesValue = checked;
    }
    begin(tool, point, radius) {
        if (this.stroke)
            this.cancel();
        const allowed = ["hair", "erase", "right-upper", "right-lower", "left-upper", "left-lower"];
        if (!allowed.includes(tool))
            throw new RangeError("Unknown drawing tool.");
        const p = normalPoint(point);
        if (tool !== "hair" && tool !== "erase" && this.tracesValue.length >= MAX_TRACES)
            throw new RangeError("The lash observation limit has been reached.");
        const painting = tool === "hair" || tool === "erase";
        this.stroke = { tool, points: [p], previousMask: painting ? this.maskValue.slice() : undefined };
        if (painting)
            paintDisc(this.maskValue, this.width, this.height, p, radius, tool === "erase");
    }
    move(point, radius) {
        const stroke = this.stroke;
        if (!stroke)
            return;
        const p = normalPoint(point), previous = stroke.points[stroke.points.length - 1];
        if (stroke.tool === "hair" || stroke.tool === "erase") {
            paintSegment(this.maskValue, this.width, this.height, previous, p, radius, stroke.tool === "erase");
            stroke.points = [p];
        }
        else if (stroke.points.length < 64 && Math.hypot(p[0] - previous[0], p[1] - previous[1]) >= 0.0005) {
            stroke.points.push(p);
        }
    }
    end() {
        const stroke = this.stroke;
        this.stroke = null;
        if (!stroke)
            return false;
        if (stroke.tool === "hair" || stroke.tool === "erase") {
            this.hairChecked = true;
            return true;
        }
        if (stroke.points.length < 2)
            return false;
        const trace = validateTrace({ side: stroke.tool.startsWith("right") ? "right" : "left",
            lower: stroke.tool.endsWith("lower"), confidence: 1, points: stroke.points });
        this.tracesValue.push(trace);
        return true;
    }
    cancel() {
        if (this.stroke?.previousMask)
            this.maskValue = this.stroke.previousMask;
        this.stroke = null;
    }
    removeLastTrace() { this.cancel(); this.tracesValue.pop(); }
    clearHair() { this.cancel(); this.maskValue.fill(0); this.hairChecked = false; }
    clearTraces() { this.cancel(); this.tracesValue = []; }
}
//# sourceMappingURL=observations.js.map