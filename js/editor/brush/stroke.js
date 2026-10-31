/** Retouch brush strokes: what a brush stroke is, and the compact text it is kept as inside a
 * Studio layer's settings, so every stroke is one undo step in the existing history and the
 * same strokes render the same pixels at any resolution (preview, compare grids, export).
 * Coordinates are shares of the photo's width and height and the brush size is a share of its
 * shorter side; nothing about the photo itself is stored. Author: John Khan.
 */
export const BRUSHES = ["heal", "smooth", "whiten", "details", "relight", "blur", "colour", "reshape"];
/** paint and erase build a brush's mask; dodge and burn are the relight brush's two paints;
 * push, bloat, pinch and restore move pixels; freeze protects an area from them. */
export const MODES = ["paint", "erase", "dodge", "burn", "push", "bloat", "pinch", "restore", "freeze"];
export const RESHAPE_MODES = ["push", "bloat", "pinch", "restore", "freeze", "erase"];
/** Face parts a stroke can be snapped to, when the photo has face points (or a marked hair area). */
export const SNAPS = ["none", "skin", "lips", "eyes", "whites", "brows", "hair"];
export const MIN_SIZE = 0.002, MAX_SIZE = 0.25;
export const MAX_POINTS = 1500;
export const MAX_STROKES = 400;
/** The longest stroke text a layer may hold (layers.ts lets the `strokes` setting be this long). */
export const MAX_STROKE_TEXT = 120_000;
const MODE_CODE = { paint: "p", erase: "e", dodge: "d", burn: "b", push: "u",
    bloat: "o", pinch: "i", restore: "r", freeze: "f" };
const SNAP_CODE = { none: "n", skin: "s", lips: "l", eyes: "y", whites: "w", brows: "b", hair: "h" };
const CODE_MODE = new Map(Object.entries(MODE_CODE).map(([k, v]) => [v, k]));
const CODE_SNAP = new Map(Object.entries(SNAP_CODE).map(([k, v]) => [v, k]));
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
function checkUnit(value, name) {
    if (!(Number.isFinite(value) && value >= 0 && value <= 1))
        throw new RangeError(`${name} must be 0 to 1`);
}
/** A checked copy of a stroke: settings in range, at least one point, points inside the photo. */
export function checkStroke(stroke) {
    if (!MODES.includes(stroke.mode))
        throw new RangeError("unknown stroke mode");
    if (!SNAPS.includes(stroke.snap))
        throw new RangeError("unknown snap");
    if (!(Number.isFinite(stroke.size) && stroke.size >= MIN_SIZE && stroke.size <= MAX_SIZE))
        throw new RangeError(`brush size must be ${MIN_SIZE} to ${MAX_SIZE}`);
    checkUnit(stroke.hardness, "hardness");
    checkUnit(stroke.opacity, "opacity");
    checkUnit(stroke.flow, "flow");
    if (!stroke.points.length)
        throw new RangeError("a stroke needs at least one point");
    if (stroke.points.length > MAX_POINTS)
        throw new RangeError(`a stroke has at most ${MAX_POINTS} points`);
    for (const p of stroke.points) {
        if (![p.x, p.y, p.pressure].every(Number.isFinite))
            throw new RangeError("stroke points must be finite");
        checkUnit(p.pressure, "pressure");
    }
    return { ...stroke, points: stroke.points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y), pressure: p.pressure })) };
}
function encodeBytes(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
        for (let k = 0; k < chars; k++)
            out += B64[(n >> (18 - 6 * k)) & 63];
    }
    return out;
}
function decodeBytes(text) {
    if (text.length % 4 === 1)
        throw new RangeError("stroke points are malformed");
    const out = new Uint8Array(Math.floor(text.length * 3 / 4));
    let o = 0;
    for (let i = 0; i < text.length; i += 4) {
        let n = 0;
        const chunk = text.slice(i, i + 4);
        for (let k = 0; k < 4; k++) {
            const v = k < chunk.length ? B64_INDEX.get(chunk[k]) : 0;
            if (v === undefined)
                throw new RangeError("stroke points are malformed");
            n |= v << (18 - 6 * k);
        }
        const bytes = chunk.length - 1;
        for (let k = 0; k < bytes; k++)
            out[o++] = (n >> (16 - 8 * k)) & 255;
    }
    return out;
}
/** Points are kept at 1/65535 of the photo side and pressure at 1/255: the same stroke
 * decodes to the same numbers everywhere. */
export function quantise(stroke) {
    const s = checkStroke(stroke);
    const q = (v, steps) => Math.round(v * steps) / steps;
    return { ...s, size: Math.round(s.size * 10000) / 10000, hardness: q(s.hardness, 100), opacity: q(s.opacity, 100), flow: q(s.flow, 100),
        points: s.points.map((p) => ({ x: q(p.x, 65535), y: q(p.y, 65535), pressure: q(p.pressure, 255) })) };
}
export function encodeStroke(stroke) {
    const s = quantise(stroke);
    const bytes = new Uint8Array(s.points.length * 5);
    s.points.forEach((p, i) => {
        const x = Math.round(p.x * 65535), y = Math.round(p.y * 65535);
        bytes.set([x >> 8, x & 255, y >> 8, y & 255, Math.round(p.pressure * 255)], i * 5);
    });
    const head = `${MODE_CODE[s.mode]}${SNAP_CODE[s.snap]}${Math.round(s.size * 10000)},${Math.round(s.hardness * 100)},${Math.round(s.opacity * 100)},${Math.round(s.flow * 100)}`;
    return `${head}:${encodeBytes(bytes)}`;
}
export function decodeStroke(text) {
    const match = /^([a-z])([a-z])(\d{1,4}),(\d{1,3}),(\d{1,3}),(\d{1,3}):([A-Za-z0-9_-]+)$/.exec(text);
    if (!match)
        throw new RangeError("stroke text is malformed");
    const mode = CODE_MODE.get(match[1]), snap = CODE_SNAP.get(match[2]);
    if (!mode || !snap)
        throw new RangeError("stroke text is malformed");
    const bytes = decodeBytes(match[7]);
    if (bytes.length % 5)
        throw new RangeError("stroke points are malformed");
    const points = [];
    for (let i = 0; i < bytes.length; i += 5) {
        points.push({ x: ((bytes[i] << 8) | bytes[i + 1]) / 65535, y: ((bytes[i + 2] << 8) | bytes[i + 3]) / 65535, pressure: bytes[i + 4] / 255 });
    }
    return checkStroke({ mode, snap, size: Number(match[3]) / 10000, hardness: Number(match[4]) / 100,
        opacity: Number(match[5]) / 100, flow: Number(match[6]) / 100, points });
}
export function encodeStrokes(strokes) {
    if (strokes.length > MAX_STROKES)
        throw new RangeError(`a brush layer holds at most ${MAX_STROKES} strokes`);
    const text = strokes.map(encodeStroke).join("|");
    if (text.length > MAX_STROKE_TEXT)
        throw new RangeError("This brush layer is full. Painting goes on in a new layer of this brush; to erase here, undo a few strokes first.");
    return text;
}
export function decodeStrokes(text) {
    if (text === "")
        return [];
    if (text.length > MAX_STROKE_TEXT)
        throw new RangeError("stroke text is too long");
    const parts = text.split("|");
    if (parts.length > MAX_STROKES)
        throw new RangeError(`a brush layer holds at most ${MAX_STROKES} strokes`);
    return parts.map(decodeStroke);
}
/** The stroke text with one more stroke on the end (what one brush stroke commits). */
export function appendStroke(text, stroke) {
    return encodeStrokes([...decodeStrokes(text), stroke]);
}
/** Keep a new point only when it is at least `spacing` pixels from the last kept one
 * (the brush draws its own dabs in between). The last point of a stroke is always kept. */
export function thin(points, width, height, spacing) {
    if (!points.length)
        return [];
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const last = out[out.length - 1], p = points[i];
        const far = Math.hypot((p.x - last.x) * width, (p.y - last.y) * height) >= spacing;
        if (far || i === points.length - 1)
            out.push(p);
    }
    return out.length > MAX_POINTS ? out.filter((_, i) => i % Math.ceil(out.length / MAX_POINTS) === 0) : out;
}
