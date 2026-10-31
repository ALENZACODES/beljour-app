import { annotationBounds } from "./annotations.js";
export function toothCells(teeth, count = 8) {
    if (count < 4 || count > 14)
        throw new Error("tooth count must be 4..14");
    const b = annotationBounds(teeth), width = (b.maxX - b.minX) / count, out = [];
    for (let i = 0; i < count; i++)
        out.push({ left: b.minX + i * width, right: b.minX + (i + 1) * width, top: b.minY, bottom: b.maxY, index: i });
    return out;
}
export function shapeScale(style) {
    const map = { natural: [.98, 1], soft_square: [1, .98], rounded: [.96, 1], longer: [.94, 1.04] };
    const v = map[style];
    if (!v)
        throw new Error("unsupported veneer style");
    return { width: v[0], height: v[1] };
}
export function shadeDelta(style) {
    const map = { natural: 2, soft_white: 5, bright_preview: 8 };
    if (map[style] === undefined)
        throw new Error("unsupported shade style");
    return map[style];
}
export function shadeWarning(delta) { return delta > 6 ? "High-contrast cosmetic simulation; natural appearance is not guaranteed." : "Cosmetic colour simulation only; material and lighting alter real shade."; }
export function materialResponse(style, light) {
    if (light < 0 || light > 1)
        throw new Error("light must be in [0,1]");
    const base = { matte: .08, natural_gloss: .18, high_gloss: .28 }[style];
    return Math.min(.35, base * (.4 + .6 * light));
}
export function acceptance(changedOutside, alphaPreserved) { return { local: changedOutside <= .001, alphaPreserved, pass: changedOutside <= .001 && alphaPreserved, modelUsed: false, checkedAnnotation: true }; }
