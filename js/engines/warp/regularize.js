import { checkPoints } from "./tps.js";
export const NEIGHBOURS = 6;
export const DIFFUSION_STEPS = 3;
export const PROJECTION_STEPS = 8;
export const LOCAL_CAP_SHARE = 0.65;
export const EDGE_SLOPE_LIMIT = 0.40;
export const GLOBAL_CAP_SHARE = 0.12;
export const MAX_GRAPH_POINTS = 4096;
export function neighbourGraph(before, referenceScale, neighbours = NEIGHBOURS) {
    checkPoints(before, "before");
    if (before.length < 3 || before.length > MAX_GRAPH_POINTS)
        throw new RangeError("regularization needs 3..4096 points");
    if (!(Number.isFinite(referenceScale) && referenceScale > 0))
        throw new RangeError("reference scale must be finite and positive");
    if (!(Number.isInteger(neighbours) && neighbours >= 1 && neighbours <= 24))
        throw new RangeError("neighbours must be an integer from 1 to 24");
    const count = Math.min(neighbours, before.length - 1), scale2 = referenceScale * referenceScale;
    const rows = [], weights = [], spacing = new Float64Array(before.length);
    const edges = new Map();
    for (let i = 0; i < before.length; i++) {
        const distances = before.map((p) => (p[0] - before[i][0]) ** 2 + (p[1] - before[i][1]) ** 2);
        const keys = distances.map((d) => Math.floor(d / scale2 * 1e12 + 0.5));
        const selected = before.map((_, j) => j).filter((j) => j !== i)
            .sort((a, b) => keys[a] - keys[b] || a - b).slice(0, count);
        rows.push(selected);
        const positive = selected.filter((j) => distances[j] > scale2 * 1e-20)
            .map((j) => Math.sqrt(distances[j])).sort((a, b) => a - b);
        if (positive.length)
            spacing[i] = positive[Math.floor((positive.length - 1) / 2)];
        const raw = selected.map((j) => 1 / Math.max(distances[j], scale2 * 1e-6));
        const total = raw.reduce((sum, value) => sum + value, 0);
        weights.push(raw.map((value) => value / total));
        for (const j of selected) {
            const a = Math.min(i, j), b = Math.max(i, j);
            edges.set(`${a},${b}`, [a, b, Math.sqrt(distances[j])]);
        }
    }
    return { neighbours: rows, weights, spacing,
        edges: [...edges.values()].sort(([a, b], [c, d]) => a - c || b - d) };
}
/** One render may evaluate many targets for the same source mesh. Bind its
 * expensive graph to a copied source and scale; never reuse it across photos or
 * silently accept a changed mesh. The original uncached path remains the default. */
export class PreparedNeighbourGraph {
    referenceScale;
    source;
    graph;
    constructor(before, referenceScale) {
        this.referenceScale = referenceScale;
        this.source = before.map(([x, y]) => [x, y]);
        this.graph = neighbourGraph(this.source, referenceScale);
    }
    forMesh(before, referenceScale) {
        if (referenceScale !== this.referenceScale || before.length !== this.source.length ||
            before.some(([x, y], i) => x !== this.source[i][0] || y !== this.source[i][1])) {
            throw new RangeError("prepared graph belongs to another mesh or scale");
        }
        return this.graph;
    }
}
function pinIndices(pinned, count) {
    if (pinned.some((i) => !Number.isInteger(i) || i < 0 || i >= count))
        throw new RangeError("pins must be valid landmark indices");
    return [...new Set(pinned)].sort((a, b) => a - b);
}
function cap(delta, caps) {
    return delta.map(([x, y], i) => {
        const fraction = Math.min(1, caps[i] / Math.max(Math.hypot(x, y), 1e-30));
        return [x * fraction, y * fraction];
    });
}
/** Apply one policy to both directions; identity pins stay exact even beside duplicates. */
export function regularizeTargets(before, requested, referenceScale, pinned = [], prepared) {
    checkPoints(before, "before");
    checkPoints(requested, "requested");
    if (before.length !== requested.length)
        throw new RangeError("before and requested must have matching points");
    const graph = prepared ? prepared.forMesh(before, referenceScale) : neighbourGraph(before, referenceScale);
    const pins = pinIndices(pinned, before.length);
    const locked = new Set(pins);
    const raw = requested.map(([x, y], i) => [x - before[i][0], y - before[i][1]]);
    const rawLengths = raw.map(([x, y]) => Math.hypot(x, y));
    const requestedMax = Math.max(...rawLengths);
    const caps = Float64Array.from(graph.spacing, (spacing, i) => locked.has(i)
        ? 0 : Math.min(referenceScale * GLOBAL_CAP_SHARE, spacing * LOCAL_CAP_SHARE));
    const base = cap(raw, caps);
    let delta = base.map(([x, y]) => [x, y]);
    for (let step = 0; step < DIFFUSION_STEPS; step++) {
        const updated = before.map((_, i) => {
            if (locked.has(i))
                return [0, 0];
            let x = 0, y = 0;
            for (let k = 0; k < graph.neighbours[i].length; k++) {
                const j = graph.neighbours[i][k], weight = graph.weights[i][k];
                x += delta[j][0] * weight;
                y += delta[j][1] * weight;
            }
            return [0.65 * base[i][0] + 0.35 * x, 0.65 * base[i][1] + 0.35 * y];
        });
        delta = cap(updated, caps);
    }
    for (let step = 0; step < PROJECTION_STEPS; step++) {
        for (const [i, j, length] of graph.edges) {
            const x = delta[j][0] - delta[i][0], y = delta[j][1] - delta[i][1];
            const magnitude = Math.hypot(x, y), limit = EDGE_SLOPE_LIMIT * length;
            if (magnitude <= limit + 1e-14 || (locked.has(i) && locked.has(j)))
                continue;
            const share = 1 - limit / magnitude, cx = x * share, cy = y * share;
            if (locked.has(i)) {
                delta[j][0] -= cx;
                delta[j][1] -= cy;
            }
            else if (locked.has(j)) {
                delta[i][0] += cx;
                delta[i][1] += cy;
            }
            else {
                delta[i][0] += cx * 0.5;
                delta[i][1] += cy * 0.5;
                delta[j][0] -= cx * 0.5;
                delta[j][1] -= cy * 0.5;
            }
        }
        delta = cap(delta, caps);
    }
    const duplicateGroups = new Map();
    before.forEach(([x, y], i) => {
        const key = `${x},${y}`, group = duplicateGroups.get(key) ?? [];
        group.push(i);
        duplicateGroups.set(key, group);
    });
    for (const indices of duplicateGroups.values()) {
        if (indices.length < 2)
            continue;
        if (indices.some((i) => locked.has(i))) {
            for (const i of indices)
                delta[i] = [0, 0];
        }
        else {
            let x = 0, y = 0, maximum = Infinity;
            for (const i of indices) {
                x += delta[i][0];
                y += delta[i][1];
                maximum = Math.min(maximum, caps[i]);
            }
            x /= indices.length;
            y /= indices.length;
            const fraction = Math.min(1, maximum / Math.max(Math.hypot(x, y), 1e-30));
            for (const i of indices)
                delta[i] = [x * fraction, y * fraction];
        }
    }
    for (const i of pins)
        delta[i] = [0, 0];
    let slope = 0;
    for (const [i, j, length] of graph.edges) {
        if (length > referenceScale * 1e-10)
            slope = Math.max(slope, Math.hypot(delta[j][0] - delta[i][0], delta[j][1] - delta[i][1]) / length);
    }
    const points = before.map(([x, y], i) => [x + delta[i][0], y + delta[i][1]]);
    return { points, report: { method: "local-spacing-diffusion-projection/1",
            capped_landmarks: rawLengths.filter((d, i) => d > caps[i] + 1e-12).length,
            smoothed_landmarks: delta.filter(([x, y], i) => Math.hypot(x - raw[i][0], y - raw[i][1]) > 1e-12).length,
            requested_max: requestedMax, applied_max: Math.max(...delta.map(([x, y]) => Math.hypot(x, y))),
            max_edge_slope: slope, pinned: pins, raster_q3_required: true } };
}
