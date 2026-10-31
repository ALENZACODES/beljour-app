/** Shared checked-annotation helpers for smile features. Author: John Khan. */
import { renderSmile } from "../engine.js";
export function requireRegions(annotation, ...names) {
    for (const name of names) {
        const value = annotation[name];
        if (!Array.isArray(value) || value.length < 3)
            throw new Error(`checked ${String(name)}  annotation required`);
    }
}
export function renderFeature(pixels, width, height, feature, annotation, amount) { return renderSmile({ width, height, channels: 4, data: pixels }, { feature: feature, amount, annotation }).data; }
