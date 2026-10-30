export function polygonArea(points) {
    if (points.length < 3)
        return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) * .5;
}
export function annotationBounds(points) {
    if (!points.length)
        throw new Error("annotation is empty");
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const [x, y] of points) {
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
            throw new Error("annotation points must be normalised");
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
}
export function annotationCentre(points) { const b = annotationBounds(points); return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; }
export function annotationStats(points) { const b = annotationBounds(points), c = annotationCentre(points); return { area: polygonArea(points), ...b, centreX: c.x, centreY: c.y, points: points.length }; }
export function validatePolygon(points, minimumArea = .0001) {
    if (points.length < 3)
        throw new Error("checked annotation needs at least three points");
    const s = annotationStats(points);
    if (s.area < minimumArea)
        throw new Error("checked annotation is too small");
    return points;
}
export function validateForFeature(feature, regions) {
    const required = { W50: ["gum"], W51: ["teeth"], W52: ["teeth"], W53: ["teeth", "gum"], W58: ["teeth"] };
    const names = required[feature];
    if (!names)
        throw new Error("unknown smile feature");
    for (const name of names) {
        const p = regions[name];
        if (!p)
            throw new Error(`${feature}  requires checked ${name}  region`);
        validatePolygon(p);
    }
    return true;
}
export function serialiseAnnotations(regions) {
    const out = {};
    for (const name of Object.keys(regions).sort())
        out[name] = regions[name].map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))]);
    return out;
}
function fnv(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}
export function sequenceHash(frames) { return fnv(JSON.stringify(frames.map(serialiseAnnotations))); }
//# sourceMappingURL=annotations.js.map