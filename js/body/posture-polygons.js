import { polygon as rasterPolygon } from "../engines/core/mask.js";
export const MIN_OUTLINE_POINTS = 3;
export const MAX_OUTLINE_POINTS = 256;
/** ASSUMED: below 64 square pixels an outline cannot hold a protected head or a torso. */
export const MIN_OUTLINE_AREA = 64;
/** ASSUMED: at least 80% of the head marking must lie inside the marked person. */
export const MIN_HEAD_INSIDE_SHARE = 0.8;
export class OutlineRefused extends RangeError {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = "OutlineRefused";
    }
}
/** Absolute shoelace area in square pixels. */
export function outlineArea(points) {
    let twice = 0;
    for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        twice += x1 * y2 - x2 * y1;
    }
    return Math.abs(twice) / 2;
}
function orientation(a, b, c) {
    const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return Math.abs(value) < 1e-12 ? 0 : Math.sign(value);
}
function onSegment(a, b, p) {
    return Math.min(a[0], b[0]) - 1e-12 <= p[0] && p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
        Math.min(a[1], b[1]) - 1e-12 <= p[1] && p[1] <= Math.max(a[1], b[1]) + 1e-12;
}
/** True when closed segments a-b and c-d share any point, including touching and overlap. */
export function segmentsIntersect(a, b, c, d) {
    const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
    if (o1 !== o2 && o3 !== o4)
        return true;
    return (o1 === 0 && onSegment(a, b, c)) || (o2 === 0 && onSegment(a, b, d)) ||
        (o3 === 0 && onSegment(c, d, a)) || (o4 === 0 && onSegment(c, d, b));
}
/** Validate a closed outline drawn on a width x height photo and return an owned copy. */
export function checkedOutline(points, width, height) {
    if (!Array.isArray(points) || points.length < MIN_OUTLINE_POINTS)
        throw new OutlineRefused("too_few_points");
    if (points.length > MAX_OUTLINE_POINTS)
        throw new OutlineRefused("too_many_points");
    const copy = [];
    for (const point of points) {
        if (!Array.isArray(point) || point.length !== 2)
            throw new OutlineRefused("point_outside_photo");
        const [x, y] = point;
        if (!(Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= width && y <= height)) {
            throw new OutlineRefused("point_outside_photo");
        }
        copy.push([x, y]);
    }
    const n = copy.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            // Adjacent edges share a vertex by construction; the first and last edge are adjacent too.
            if (j === i + 1 || (i === 0 && j === n - 1))
                continue;
            if (segmentsIntersect(copy[i], copy[(i + 1) % n], copy[j], copy[(j + 1) % n])) {
                throw new OutlineRefused("self_crossing_outline");
            }
        }
    }
    for (let i = 0; i < n; i++) {
        const next = copy[(i + 1) % n];
        if (copy[i][0] === next[0] && copy[i][1] === next[1])
            throw new OutlineRefused("self_crossing_outline");
    }
    if (outlineArea(copy) < MIN_OUTLINE_AREA)
        throw new OutlineRefused("outline_too_small");
    return copy;
}
/** Anti-aliased coverage mask of an outline (4x supersampled). */
export function outlineMask(points, width, height) {
    return rasterPolygon(width, height, checkedOutline(points, width, height), 4);
}
/** Share of the inner mask's covered pixels that are also covered by the outer mask. */
export function coveredShare(inner, outer, level = 0.5) {
    if (inner.width !== outer.width || inner.height !== outer.height)
        throw new RangeError("masks differ in size");
    let total = 0, inside = 0;
    for (let i = 0; i < inner.data.length; i++) {
        if (inner.data[i] < level)
            continue;
        total++;
        if (outer.data[i] >= level)
            inside++;
    }
    return total ? inside / total : 0;
}
export function requireHeadInsidePerson(head, person) {
    const share = coveredShare(head, person);
    if (share < MIN_HEAD_INSIDE_SHARE)
        throw new OutlineRefused("head_outside_person");
    return share;
}
