/** Named output sizes; limits prevent unexpected upscale or large allocations. */
import { ProInputError, requireDimensions } from "./types.js";
import { makeCropGeometry } from "./crop.js";
export const EXPORT_PRESETS = Object.freeze({
    original: { id: "original", label: "High quality · JPG", mime: "image/jpeg",
        maxEdge: 4800, quality: 0.92, extension: "jpg" },
    web: { id: "web", label: "Web · JPG", mime: "image/jpeg", maxEdge: 1600, quality: 0.86, extension: "jpg" },
    portrait: { id: "portrait", label: "Portrait · JPG", mime: "image/jpeg",
        maxEdge: 1350, quality: 0.9, extension: "jpg" },
    story: { id: "story", label: "Story · JPG", mime: "image/jpeg", maxEdge: 1920, quality: 0.9, extension: "jpg" },
    lossless: { id: "lossless", label: "Lossless · PNG", mime: "image/png", maxEdge: 4800, quality: 1, extension: "png" },
});
export function safeStem(value) {
    if (typeof value !== "string")
        throw new ProInputError("File name must be text");
    const stem = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 48);
    return stem || "look";
}
export function simulationText(recipe) {
    return recipe.simulation && recipe.simulationLabel ? "Simulation" : null;
}
export function planProExport(width, height, recipe, fileStem) {
    requireDimensions(width, height);
    if (!Object.hasOwn(EXPORT_PRESETS, recipe.export)) {
        throw new ProInputError("Unknown export type");
    }
    const preset = EXPORT_PRESETS[recipe.export];
    const geometry = makeCropGeometry(width, height, recipe.crop, preset.maxEdge);
    return { preset, geometry, filename: `${safeStem(fileStem)}.${preset.extension}`, label: simulationText(recipe) };
}
