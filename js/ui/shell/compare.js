/** E24 compare modes (plan M72 / FS5): ten ways to read "before" against "after".
 *
 * Every function here is pure pixel arithmetic on our own ByteImage buffers: no canvas,
 * no DOM, no network and no third-party art. The DOM layer (compare-view.ts) only paints
 * what these functions return, so the same results are unit-tested in Node.
 *
 * The ten modes:
 *   1 hold             press and hold to see the original (the R8 control, kept as mode 1)
 *   2 split-vertical   before on the left, after on the right, movable divider
 *   3 split-horizontal before on top, after below
 *   4 split-diagonal   before above the diagonal, after below it
 *   5 side-by-side     two panes, stacked on a narrow phone when that shows more
 *   6 grid-2x2         original, all edits, the selected layer alone, all edits without it
 *   7 stop-grid        the selected layer at nine strengths (its named stops included)
 *   8 flicker          alternates before and after at a safe rate; manual on reduced motion
 *   9 loupe            magnified before and after crops at the same point (synced zoom)
 *   0 difference       "what changed": |after - before| over a dimmed copy of the photo
 * The captioned "photo board" is the export of the side-by-side and grid modes
 * (compare-view.ts draws the captions from compare-layout.ts boxes).
 *
 * Author: John Khan.
 */
import { byteImage, requireColour, resize } from "../../engines/core/buffer.js";
export const COMPARE_MODES = ["hold", "split-vertical", "split-horizontal", "split-diagonal", "side-by-side",
    "grid-2x2", "stop-grid", "flicker", "loupe", "difference"];
export const MODE_INFO = Object.freeze({
    hold: { id: "hold", title: "Hold", key: "1", summary: "Press and hold to see the original. Space toggles it from the keyboard.",
        inputs: "pair", pointer: "none", animated: false, board: false },
    "split-vertical": { id: "split-vertical", title: "Split ⟷", key: "2", summary: "Before on the left, after on the right. Drag or use the arrow keys to move the line.",
        inputs: "pair", pointer: "position", animated: false, board: false },
    "split-horizontal": { id: "split-horizontal", title: "Split ↕", key: "3", summary: "Before on top, after below. Drag or use the arrow keys to move the line.",
        inputs: "pair", pointer: "position", animated: false, board: false },
    "split-diagonal": { id: "split-diagonal", title: "Split ⟋", key: "4", summary: "Before above the diagonal, after below it. Drag or use the arrow keys.",
        inputs: "pair", pointer: "position", animated: false, board: false },
    "side-by-side": { id: "side-by-side", title: "Side by side", key: "5", summary: "Two panes with captions. On a narrow screen they stack when that shows more.",
        inputs: "pair", pointer: "none", animated: false, board: true },
    "grid-2x2": { id: "grid-2x2", title: "2 × 2", key: "6", summary: "Original, all edits, the selected layer alone, and all edits without it.",
        inputs: "quad", pointer: "none", animated: false, board: true },
    "stop-grid": { id: "stop-grid", title: "3 × 3 stops", key: "7", summary: "The selected layer at nine strengths, named stops included.",
        inputs: "stops", pointer: "none", animated: false, board: true },
    flicker: { id: "flicker", title: "Flicker", key: "8", summary: "Alternates before and after. With reduced motion it waits for Space or a tap.",
        inputs: "pair", pointer: "none", animated: true, board: false },
    loupe: { id: "loupe", title: "Loupe", key: "9", summary: "The same small area of before and after, magnified together. Arrow keys move it.",
        inputs: "pair", pointer: "point", animated: false, board: false },
    difference: { id: "difference", title: "What changed", key: "0", summary: "Changed pixels in colour over a dimmed copy: blue for small changes, red for large.",
        inputs: "pair", pointer: "none", animated: false, board: false },
});
export function isCompareMode(value) {
    return typeof value === "string" && COMPARE_MODES.includes(value);
}
export function splitOrientation(mode) {
    if (mode === "split-vertical")
        return "vertical";
    if (mode === "split-horizontal")
        return "horizontal";
    if (mode === "split-diagonal")
        return "diagonal";
    return null;
}
/** Brand colours used for dividers and the difference ramp (theme.css --bleu-clair, --blanc, --rouge). */
export const DIVIDER_EDGE = [0, 85, 164];
export const DIVIDER_CORE = [255, 255, 255];
export const RAMP_LOW = [0, 85, 164];
export const RAMP_MID = [255, 255, 255];
export const RAMP_HIGH = [206, 17, 38];
/** Any colour buffer as packed RGB (alpha composited over white, as R8's loader does). */
export function asRGB(img) {
    requireColour(img);
    const n = img.width * img.height, out = new Uint8Array(n * 3);
    if (img.channels === 3) {
        out.set(img.data);
        return { width: img.width, height: img.height, channels: 3, data: out };
    }
    for (let i = 0; i < n; i++) {
        const a = img.data[i * 4 + 3] / 255;
        for (let c = 0; c < 3; c++)
            out[i * 3 + c] = Math.round(img.data[i * 4 + c] * a + 255 * (1 - a));
    }
    return { width: img.width, height: img.height, channels: 3, data: out };
}
function requirePair(before, after) {
    requireColour(before);
    requireColour(after);
    if (before.width !== after.width || before.height !== after.height)
        throw new RangeError("Before and after must be the same size");
}
export function clampUnit(value) {
    if (!Number.isFinite(value))
        throw new RangeError("Position must be a finite number");
    return Math.min(1, Math.max(0, value));
}
/** Signed distance in pixels from the split line; negative means the "before" side. */
export function splitDistance(orientation, x, y, width, height, position) {
    if (orientation === "vertical")
        return x + 0.5 - position * width;
    if (orientation === "horizontal")
        return y + 0.5 - position * height;
    // The diagonal runs from top-right to bottom-left; position 0 shows only "after".
    const ax = 1 / width, ay = 1 / height;
    const f = (x + 0.5) * ax + (y + 0.5) * ay - 2 * position;
    return f / Math.hypot(ax, ay);
}
/** One image with "before" on one side of a movable line and "after" on the other. */
export function composeSplit(before, after, orientation, position, { line = 2, showLine = true } = {}) {
    requirePair(before, after);
    const p = clampUnit(position);
    if (!(Number.isFinite(line) && line >= 0 && line <= 12))
        throw new RangeError("Divider width must be 0–12 px");
    const a = asRGB(before), b = asRGB(after), { width, height } = a;
    const out = byteImage(width, height, 3);
    const drawLine = showLine && line > 0 && p > 0 && p < 1;
    const core = line / 2, edge = core + 1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            const d = splitDistance(orientation, x, y, width, height, p);
            const from = d < 0 ? a.data : b.data;
            if (drawLine && Math.abs(d) < edge) {
                const colour = Math.abs(d) < core ? DIVIDER_CORE : DIVIDER_EDGE;
                out.data[i] = colour[0];
                out.data[i + 1] = colour[1];
                out.data[i + 2] = colour[2];
            }
            else {
                out.data[i] = from[i];
                out.data[i + 1] = from[i + 1];
                out.data[i + 2] = from[i + 2];
            }
        }
    }
    return out;
}
/** Per-channel |after − before|, the plain definition the plan's difference-map test uses. */
export function absoluteDifference(before, after) {
    requirePair(before, after);
    const a = asRGB(before), b = asRGB(after), out = byteImage(a.width, a.height, 3);
    for (let i = 0; i < out.data.length; i++)
        out.data[i] = Math.abs(a.data[i] - b.data[i]);
    return out;
}
export function differenceStats(before, after, threshold = 1) {
    if (!(Number.isInteger(threshold) && threshold >= 1 && threshold <= 255))
        throw new RangeError("Threshold must be 1–255");
    const diff = absoluteDifference(before, after), { width, height } = diff;
    let changed = 0, sum = 0, max = 0, left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            const d = Math.max(diff.data[i], diff.data[i + 1], diff.data[i + 2]);
            sum += d;
            if (d > max)
                max = d;
            if (d >= threshold) {
                changed++;
                if (x < left)
                    left = x;
                if (x > right)
                    right = x;
                if (y < top)
                    top = y;
                if (y > bottom)
                    bottom = y;
            }
        }
    }
    const n = width * height;
    return { changed, percent: 100 * changed / n, mean: sum / n, max, threshold,
        box: right < 0 ? null : [left, top, right, bottom] };
}
function lerp3(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
/** Colour for a change of strength m in [0, 1]: blue, through white, to red. */
export function rampColour(m) {
    const t = clampUnit(m);
    return t <= 0.5 ? lerp3(RAMP_LOW, RAMP_MID, t * 2) : lerp3(RAMP_MID, RAMP_HIGH, (t - 0.5) * 2);
}
export function differenceMap(before, after, { gain = 4, threshold = 1, context = 0.35 } = {}) {
    if (!(Number.isFinite(gain) && gain >= 1 && gain <= 64))
        throw new RangeError("Gain must be 1–64");
    if (!(Number.isFinite(context) && context >= 0 && context <= 1))
        throw new RangeError("Context must be 0–1");
    const stats = differenceStats(before, after, threshold);
    const a = asRGB(before), diff = absoluteDifference(before, after), out = byteImage(a.width, a.height, 3);
    for (let p = 0; p < a.width * a.height; p++) {
        const i = p * 3;
        const d = Math.max(diff.data[i], diff.data[i + 1], diff.data[i + 2]);
        if (d >= threshold) {
            const colour = rampColour(Math.min(1, d * gain / 255));
            out.data[i] = colour[0];
            out.data[i + 1] = colour[1];
            out.data[i + 2] = colour[2];
        }
        else {
            const grey = Math.round((0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2]) * context);
            out.data[i] = grey;
            out.data[i + 1] = grey;
            out.data[i + 2] = grey;
        }
    }
    return { image: out, stats };
}
/** The square crop a loupe of `pane` output pixels shows at `zoom`, kept inside the photo. */
export function loupeCrop(width, height, centre, zoom, pane) {
    if (!(Number.isFinite(zoom) && zoom >= 1 && zoom <= 16))
        throw new RangeError("Loupe zoom must be 1–16×");
    if (!(Number.isInteger(pane) && pane >= 16 && pane <= 2048))
        throw new RangeError("Loupe pane must be 16–2048 px");
    if (!centre.every(Number.isFinite))
        throw new RangeError("Loupe point must be finite");
    const side = Math.max(2, Math.min(width, height, Math.round(pane / zoom)));
    const left = Math.min(width - side, Math.max(0, Math.round(centre[0] - side / 2)));
    const top = Math.min(height - side, Math.max(0, Math.round(centre[1] - side / 2)));
    return { left, top, side, scale: pane / side };
}
function magnify(img, crop, pane, out, offsetX) {
    for (let y = 0; y < pane; y++) {
        const sy = crop.top + Math.min(crop.side - 1, Math.floor(y / crop.scale));
        for (let x = 0; x < pane; x++) {
            const sx = crop.left + Math.min(crop.side - 1, Math.floor(x / crop.scale));
            const s = (sy * img.width + sx) * 3, d = (y * out.width + offsetX + x) * 3;
            out.data[d] = img.data[s];
            out.data[d + 1] = img.data[s + 1];
            out.data[d + 2] = img.data[s + 2];
        }
    }
}
/** Two magnified panes, before then after, nearest-neighbour so no detail is invented. */
export function composeLoupe(before, after, centre, zoom, pane, { gap = 4, stacked = false } = {}) {
    requirePair(before, after);
    if (!(Number.isInteger(gap) && gap >= 0 && gap <= 64))
        throw new RangeError("Gap must be 0–64 px");
    const a = asRGB(before), b = asRGB(after);
    const crop = loupeCrop(a.width, a.height, centre, zoom, pane);
    const width = stacked ? pane : pane * 2 + gap, height = stacked ? pane * 2 + gap : pane;
    const out = byteImage(width, height, 3);
    out.data.fill(255);
    if (!stacked) {
        magnify(a, crop, pane, out, 0);
        magnify(b, crop, pane, out, pane + gap);
        return { image: out, crop };
    }
    const top = byteImage(pane, pane, 3), bottom = byteImage(pane, pane, 3);
    magnify(a, crop, pane, top, 0);
    magnify(b, crop, pane, bottom, 0);
    out.data.set(top.data, 0);
    out.data.set(bottom.data, (pane + gap) * pane * 3);
    return { image: out, crop };
}
/** Fit (contain) an image inside a box, preserving its shape. */
export function fitInside(width, height, boxW, boxH) {
    if (!(width > 0 && height > 0 && boxW > 0 && boxH > 0))
        throw new RangeError("Sizes must be positive");
    const scale = Math.min(boxW / width, boxH / height);
    const w = Math.max(1, Math.min(boxW, Math.round(width * scale))), h = Math.max(1, Math.min(boxH, Math.round(height * scale)));
    return { width: w, height: h, x: Math.floor((boxW - w) / 2), y: Math.floor((boxH - h) / 2) };
}
/** Paste fitted images into cell rectangles on a page of the given colour. */
export function composeCells(width, height, items, background = [255, 255, 255]) {
    if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1))
        throw new RangeError("Board size must be whole pixels");
    const out = byteImage(width, height, 3), placed = [];
    for (let i = 0; i < width * height; i++) {
        out.data[i * 3] = background[0];
        out.data[i * 3 + 1] = background[1];
        out.data[i * 3 + 2] = background[2];
    }
    for (const { image, cell } of items) {
        if (cell.x < 0 || cell.y < 0 || cell.x + cell.w > width || cell.y + cell.h > height)
            throw new RangeError("A cell lies outside the board");
        const fit = fitInside(image.width, image.height, cell.w, cell.h);
        const scaled = fit.width === image.width && fit.height === image.height ? asRGB(image) : asRGB(resize(image, fit.width, fit.height));
        const ox = cell.x + fit.x, oy = cell.y + fit.y;
        for (let y = 0; y < fit.height; y++) {
            out.data.set(scaled.data.subarray(y * fit.width * 3, (y + 1) * fit.width * 3), ((oy + y) * width + ox) * 3);
        }
        placed.push({ x: ox, y: oy, w: fit.width, h: fit.height });
    }
    return { image: out, placed };
}
export const MIN_FLICKER_MS = 400, MAX_FLICKER_MS = 3000, DEFAULT_FLICKER_MS = 700;
/** Flicker period guard: at 400 ms or slower there are at most 2.5 changes a second, well under
 * the three-flashes-a-second limit for photosensitive viewers. */
export function flickerPeriod(ms) {
    if (!Number.isFinite(ms))
        throw new RangeError("Flicker speed must be finite");
    return Math.round(Math.min(MAX_FLICKER_MS, Math.max(MIN_FLICKER_MS, ms)));
}
export function flickerFrame(elapsedMs, periodMs, playing, manual) {
    if (!playing)
        return manual;
    if (!(Number.isFinite(elapsedMs) && elapsedMs >= 0))
        throw new RangeError("Elapsed time must be non-negative");
    return Math.floor(elapsedMs / flickerPeriod(periodMs)) % 2 === 0 ? "before" : "after";
}
/** Nine strengths for the 3×3 grid: every named stop of the tool, then the widest gaps split
 * in half until there are nine. Values are rounded to half a percent and strictly rising. */
export function stopGridValues(stops, count = 9) {
    if (!(Number.isInteger(count) && count >= 2 && count <= 25))
        throw new RangeError("The stop grid needs 2–25 cells");
    const values = [...new Set([0, 100, ...stops.map((s) => s.value)])].filter((v) => v >= 0 && v <= 100).sort((x, y) => x - y);
    while (values.length > count)
        values.splice(Math.floor(values.length / 2), 1);
    while (values.length < count) {
        let at = 0, widest = -1;
        for (let i = 0; i < values.length - 1; i++) {
            const gap = values[i + 1] - values[i];
            if (gap > widest + 1e-9) {
                widest = gap;
                at = i;
            }
        }
        const middle = Math.round((values[at] + values[at + 1])) / 2;
        if (middle <= values[at] || middle >= values[at + 1])
            throw new RangeError("Stops are too close to split further");
        values.splice(at + 1, 0, middle);
    }
    return values;
}
//# sourceMappingURL=compare.js.map