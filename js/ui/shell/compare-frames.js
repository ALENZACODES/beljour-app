import { MODE_INFO, stopGridValues } from "./compare.js";
import { countLine, effective } from "./layers.js";
import { renderLayers } from "./pipeline.js";
import { scaleSource } from "./scale.js";
import { strengthName, stopsFor } from "./stops.js";
import { RENDER_KINDS } from "./types.js";
export const QUAD_SIDE = 360;
export const STOP_SIDE = 240;
const isLocal = (layer) => RENDER_KINDS.includes(layer.kind);
/** The layer the grid modes study. */
export function targetLayer(layers, selected) {
    const chosen = selected ? layers.find((l) => l.id === selected) : undefined;
    if (chosen && isLocal(chosen))
        return chosen;
    const visible = [...layers].reverse().find((l) => isLocal(l) && l.enabled && l.opacity > 0);
    return visible ?? null;
}
/** A stop's name when the value is a named stop, otherwise the value with its half percent. */
export function stopLabel(kind, value) {
    const named = strengthName(kind, value);
    if (!named.endsWith("%"))
        return named;
    return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}
/** The stacks (layer lists) a mode renders, without rendering them. */
export function stacksFor(mode, layers, selected) {
    const info = MODE_INFO[mode];
    const all = layers.map((l) => ({ ...l, parameters: { ...l.parameters } }));
    // A crop is the frame both sides are shown in: the original is cropped the same way, so a
    // before/after pair lines up pixel for pixel.
    const frame = all.filter((l) => l.kind === "crop");
    if (info.inputs === "pair") {
        return [{ id: "original", caption: "Original", layers: frame }, { id: "edited", caption: effective(all).length ? "With your edits" : "With your edits (none yet)", layers: all }];
    }
    const target = targetLayer(layers, selected);
    if (info.inputs === "quad") {
        if (!target) {
            return [{ id: "original", caption: "Original", layers: frame }, { id: "edited", caption: "All edits (none yet)", layers: all },
                { id: "alone", caption: "Add a local layer to see it alone", layers: frame },
                { id: "without", caption: "Add a local layer to see the rest without it", layers: all }];
        }
        const alone = [...(target.kind === "crop" ? [] : frame), { ...target, enabled: true, parameters: { ...target.parameters } }];
        return [
            { id: "original", caption: "Original", layers: frame },
            { id: "edited", caption: "All edits", layers: all },
            { id: "alone", caption: `${target.name} alone`, layers: alone },
            { id: "without", caption: `All edits without ${target.name}`, layers: all.filter((l) => l.id !== target.id) },
        ];
    }
    if (!target)
        throw new Error("Add or select a local layer to see it at nine strengths.");
    const kind = target.kind;
    return stopGridValues(stopsFor(kind)).map((value) => ({
        id: `stop-${value}`,
        caption: `${target.name} · ${stopLabel(kind, value)}`,
        layers: all.map((l) => l.id === target.id ? { ...l, enabled: true, strength: value } : l),
    }));
}
export function sideFor(mode) {
    const info = MODE_INFO[mode];
    return info.inputs === "quad" ? QUAD_SIDE : info.inputs === "stops" ? STOP_SIDE : null;
}
export function renderStack(source, stack) {
    const preview = renderLayers(source, stack.layers);
    return { id: stack.id, caption: stack.caption, image: preview.image, effective: preview.effective, count: countLine(stack.layers),
        simulation: effective(stack.layers).some((l) => l.simulation) };
}
/** Render every frame a mode needs. `current` reuses the editor's preview for the pair modes,
 * and a cache (when given) means identical stacks on the same source never render twice. */
export function compareFrames(source, layers, selected, mode, current, cache) {
    const stacks = stacksFor(mode, layers, selected), side = sideFor(mode);
    let base = null;
    return stacks.map((stack) => {
        if (side === null && stack.id === "original" && !effective(stack.layers).length)
            return { id: "original", caption: stack.caption, image: source.image, effective: 0, simulation: false };
        if (side === null && stack.id === "original" && current?.before)
            return { id: "original", caption: stack.caption, image: current.before, effective: 0, simulation: false };
        if (side === null && stack.id === "edited" && current) {
            return { id: "edited", caption: stack.caption, image: current.image, effective: current.effective, count: countLine(stack.layers),
                simulation: effective(stack.layers).some((l) => l.simulation) };
        }
        const key = FrameCache.key(`${source.id}:${source.geometryRevision ?? 0}`, side, stack);
        const hit = cache?.get(key);
        if (hit)
            return hit;
        base ??= side === null ? source : scaleSource(source, side);
        const frame = renderStack(base, stack);
        cache?.set(key, frame);
        return frame;
    });
}
/** A small least-recently-used cache of rendered frames keyed by source and stack settings. */
export class FrameCache {
    limit;
    items = new Map();
    constructor(limit = 48) {
        this.limit = limit;
        if (!(Number.isInteger(limit) && limit >= 1 && limit <= 512))
            throw new RangeError("Cache size must be 1–512");
    }
    static key(sourceId, side, stack) {
        return `${sourceId}|${side ?? "full"}|${JSON.stringify(stack.layers)}|${stack.caption}`;
    }
    get size() { return this.items.size; }
    get(key) {
        const hit = this.items.get(key);
        if (hit) {
            this.items.delete(key);
            this.items.set(key, hit);
        }
        return hit;
    }
    set(key, frame) {
        this.items.delete(key);
        this.items.set(key, frame);
        while (this.items.size > this.limit)
            this.items.delete(this.items.keys().next().value);
    }
    clear() { this.items.clear(); }
}
