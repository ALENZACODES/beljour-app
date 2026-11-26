/** Curves: an RGB master curve and red, green and blue curves, stored in the layer as short
 * "x:y,x:y" strings (0-255 integers, 2 to 10 points), evaluated with the repo's monotone
 * Hermite curves (web/src/pro/curves.ts) into the colour pass's 1024-entry table.
 * Output never decreases with input, so a curve cannot invert or posterise the photo.
 * Presets are starting points, named in Beljour's way after French towns; none is a default.
 * Author: John Khan.
 */
import { curveValue, validateCurve } from "../../pro/curves.js";
import { CURVE_SIZE } from "./colour.js";
export const CURVE_CHANNELS = ["master", "red", "green", "blue"];
export const CHANNEL_LABELS = { master: "RGB", red: "Red", green: "Green", blue: "Blue" };
export const MAX_POINTS = 10;
/** A point the user drags keeps at least this many levels from its neighbours. */
export const MIN_GAP = 4;
export const STRAIGHT = [[0, 0], [255, 255]];
export function encodePoints(points) {
    return points.map(([x, y]) => `${x}:${y}`).join(",");
}
/** Parse and check a stored curve; anything malformed is refused, not guessed. */
export function decodePoints(text) {
    const points = text.split(",").map((pair) => {
        const m = /^(\d{1,3}):(\d{1,3})$/.exec(pair);
        if (!m)
            throw new RangeError("A curve point is x:y with whole numbers 0-255");
        return [Number(m[1]), Number(m[2])];
    });
    checkPoints(points);
    return points;
}
export function checkPoints(points) {
    if (points.length < 2 || points.length > MAX_POINTS)
        throw new RangeError(`A curve has 2 to ${MAX_POINTS} points`);
    if (points[0][0] !== 0 || points[points.length - 1][0] !== 255)
        throw new RangeError("A curve runs from input 0 to input 255");
    for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 255 || y < 0 || y > 255)
            throw new RangeError("Curve points are whole numbers 0-255");
        if (i > 0 && (x <= points[i - 1][0] || y < points[i - 1][1]))
            throw new RangeError("Curve inputs increase and outputs never go down");
    }
}
export function isStraight(points) {
    return points.every(([x, y]) => x === y);
}
/** The four curves of a layer (missing = straight). */
export function readCurves(params) {
    const out = {};
    for (const ch of CURVE_CHANNELS) {
        const v = params[ch];
        out[ch] = typeof v === "string" ? decodePoints(v) : STRAIGHT;
    }
    return out;
}
export function withCurve(params, channel, points) {
    checkPoints(points);
    const next = { ...params };
    if (isStraight(points))
        delete next[channel];
    else
        next[channel] = encodePoints(points);
    delete next.preset;
    return next;
}
export function curvesAreStraight(curves) {
    return CURVE_CHANNELS.every((ch) => isStraight(curves[ch]));
}
const asCurve = (points) => points.map(([x, y]) => ({ x: x / 255, y: y / 255 }));
/** Sample one curve at `n` evenly spaced inputs in [0, 1]. */
export function sampleCurve(points, n = CURVE_SIZE) {
    const curve = asCurve(points);
    validateCurve(curve);
    return Float32Array.from({ length: n }, (_, i) => curveValue(curve, i / (n - 1)));
}
/** The colour pass table: per channel, its curve applied after the master curve (interleaved RGB). */
export function curveTable(curves, strength = 100) {
    const master = sampleCurve(curves.master), table = new Float32Array(CURVE_SIZE * 3), k = Math.max(0, Math.min(100, strength)) / 100;
    const channels = [curves.red, curves.green, curves.blue].map((p) => asCurve(p));
    for (let i = 0; i < CURVE_SIZE; i++) {
        const x = i / (CURVE_SIZE - 1);
        for (let c = 0; c < 3; c++) {
            const y = curveValue(channels[c], master[i]);
            table[i * 3 + c] = x + (y - x) * k;
        }
    }
    return table;
}
/** Move point `index` of a curve to (x, y), keeping the order and the end inputs. Returns a new list. */
export function movePoint(points, index, x, y) {
    if (!Number.isInteger(index) || index < 0 || index >= points.length)
        throw new RangeError("No such curve point");
    const out = points.map(([px, py]) => [px, py]);
    const lo = index === 0 ? 0 : out[index - 1][0] + MIN_GAP, hi = index === out.length - 1 ? 255 : out[index + 1][0] - MIN_GAP;
    const nx = index === 0 ? 0 : index === out.length - 1 ? 255 : Math.round(Math.max(lo, Math.min(hi, x)));
    const ylo = index === 0 ? 0 : out[index - 1][1], yhi = index === out.length - 1 ? 255 : out[index + 1][1];
    out[index] = [nx, Math.round(Math.max(ylo, Math.min(yhi, y)))];
    return out;
}
/** Add a point on the curve at input x (between existing points), or null when it can't fit. */
export function addPoint(points, x, y) {
    if (points.length >= MAX_POINTS)
        return null;
    const nx = Math.round(x);
    const after = points.findIndex(([px]) => px > nx);
    if (after <= 0 || nx - points[after - 1][0] < MIN_GAP || points[after][0] - nx < MIN_GAP)
        return null;
    const ny = Math.round(Math.max(points[after - 1][1], Math.min(points[after][1], y)));
    const out = [...points.slice(0, after), [nx, ny], ...points.slice(after)];
    return { points: out, index: after };
}
export function removePoint(points, index) {
    if (index <= 0 || index >= points.length - 1)
        return points;
    return points.filter((_, i) => i !== index);
}
/** Starting points. Each is her choice from the strip or the menu; none runs by default. */
export const CURVE_PRESETS = Object.freeze([
    { id: "original", name: "Original", note: "Straight curves: no change.", curves: {} },
    { id: "arles", name: "Arles", note: "A soft S-curve: a little more depth, nothing clipped.", curves: { master: [[0, 0], [64, 56], [192, 202], [255, 255]] } },
    { id: "foix", name: "Foix", note: "A strong S-curve for crisp, graphic light.", curves: { master: [[0, 0], [64, 46], [192, 212], [255, 255]] } },
    { id: "dieppe", name: "Dieppe", note: "Matte: blacks lifted, whites rolled off.", curves: { master: [[0, 28], [64, 74], [192, 196], [255, 240]] } },
    { id: "autun", name: "Autun", note: "Opens the mid tones; black and white stay put.", curves: { master: [[0, 0], [128, 150], [255, 255]] } },
    { id: "cluny", name: "Cluny", note: "Deeper mid tones for a quieter mood.", curves: { master: [[0, 0], [128, 108], [255, 255]] } },
    { id: "ornans", name: "Ornans", note: "Warmer: red up and blue down in the mid tones.", curves: { red: [[0, 0], [128, 138], [255, 255]], blue: [[0, 0], [128, 118], [255, 255]] } },
    { id: "lorient", name: "Lorient", note: "Cooler: blue up and red down in the mid tones.", curves: { red: [[0, 0], [128, 120], [255, 255]], blue: [[0, 0], [128, 138], [255, 255]] } },
    { id: "valence", name: "Valence", note: "Faded print: lifted blue shadows, warm highlights.", curves: { master: [[0, 16], [255, 248]], blue: [[0, 22], [128, 130], [255, 240]], red: [[0, 0], [192, 198], [255, 255]] } },
]);
export function curvePreset(id) {
    const found = CURVE_PRESETS.find((p) => p.id === id);
    if (!found)
        throw new RangeError(`Unknown curve preset ${id}`);
    return found;
}
/** Layer params for a preset. All four channels are written (straight ones too), so picking a
 * preset from the strip replaces the curves instead of merging with the old ones. */
export function presetParams(id) {
    const preset = curvePreset(id), out = {};
    for (const ch of CURVE_CHANNELS) {
        const points = preset.curves[ch] ?? STRAIGHT;
        checkPoints(points);
        out[ch] = encodePoints(points);
    }
    out.preset = id;
    return out;
}
//# sourceMappingURL=curves.js.map