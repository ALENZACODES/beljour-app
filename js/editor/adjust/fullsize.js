/** Full-size save for the whole Studio stack.
 *
 * The Studio edits a device-sized copy (640 px). On Save, the opened file is decoded at full size
 * (up to 12 MP) and every stage is carried to it:
 *   - develop, crop geometry and finish run on the full-size pixels themselves (they are defined
 *     in shares of the photo, so the result is the same picture at more pixels);
 *   - every other layer (filters, portrait looks, skin, makeup, hair, studio, age...) is rendered
 *     at the preview size as now, and its change is carried up by a local linear colour model:
 *     in each small window of the preview, out = a * in + b per channel, fitted with a guided
 *     filter whose regulariser pulls a toward 1 (so flat areas keep the full-size texture and only
 *     shift), then a and b are spread to full size and applied to the full-size input;
 *   - the carried result is checked: shrunk back to the preview size it must match the preview
 *     render (mean difference and 99th percentile). A layer that moves pixels (a face warp, a
 *     posture change) or draws new fine detail can't be described by a colour model and fails the
 *     check; inside the area it changed, that layer's preview render is enlarged instead (softer
 *     there), and the full-size pixels are kept everywhere else. The result says which layers
 *     took which path, so the app never claims full detail it doesn't have.
 *   - retouch brush layers (editor/brush) render on the full-size pixels too, since their strokes
 *     are in shares of the photo; the reshape brush moves pixels and takes the moved-layer path.
 * Author: John Khan.
 */
import { resizeArea } from "../../engines/core/buffer.js";
import { applyLocalLayer, copyRGB, mixOpacity, nextFace } from "../../ui/shell/pipeline.js";
import { effective } from "../../ui/shell/layers.js";
import { appearanceOrder } from "../../ui/shell/appearance-stack.js";
import { boxMean } from "./detail.js";
import { developStage, finishStage, geometryStage, stagePlan } from "./stack.js";
import { mapToOutput, readGeometry, isIdentity } from "../crop/geometry.js";
import { movesPixels, rendersAtFullSize } from "../brush/layer.js";
/** ASSUMED check limits (8-bit levels), set on drawn photos in editor-fullsize.test.mjs. */
export const CARRY_MEAN = 1.5;
export const CARRY_P99 = 10;
/** Layers that move pixels rather than recolour them (age reshape, gender warp, posture). */
export const MOVING_KINDS = ["posture", "gender", "older", "younger"];
function movedPoints(after, before) {
    if (!after)
        return false;
    if (!before || after.length !== before.length)
        return true;
    return after.some((p, i) => Math.abs(p[0] - before[i][0]) > 0.25 || Math.abs(p[1] - before[i][1]) > 0.25);
}
/** Per-channel local linear model of preview in -> out (planes of a and b, interleaved RGB), and
 * `keep`: how much of the finest detail the layer kept (its local fine-detail energy out / in,
 * 0.25..1.5), so a layer that smooths also smooths the detail only the full-size photo has. */
export function fitCarry(input, output, radius, eps = 0.002) {
    const { width: w, height: h } = input, n = w * h;
    const a = new Float32Array(n * 3), b = new Float32Array(n * 3);
    const I = new Float32Array(n), O = new Float32Array(n), II = new Float32Array(n), IO = new Float32Array(n);
    const eIn = new Float32Array(n), eOut = new Float32Array(n);
    for (let c = 0; c < 3; c++) {
        for (let i = 0; i < n; i++) {
            I[i] = input.data[i * input.channels + c] / 255;
            O[i] = output.data[i * output.channels + c] / 255;
            II[i] = I[i] * I[i];
            IO[i] = I[i] * O[i];
        }
        const mI = boxMean(I, w, h, radius), mO = boxMean(O, w, h, radius), mII = boxMean(II, w, h, radius), mIO = boxMean(IO, w, h, radius);
        const ca = new Float32Array(n), cb = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const v = mII[i] - mI[i] * mI[i], cov = mIO[i] - mI[i] * mO[i];
            // Ridge toward a = 1: a flat window keeps its full-size texture and only shifts.
            ca[i] = (cov + eps) / (v + eps);
            cb[i] = mO[i] - ca[i] * mI[i];
        }
        const sa = boxMean(ca, w, h, radius), sb = boxMean(cb, w, h, radius);
        for (let i = 0; i < n; i++) {
            a[i * 3 + c] = sa[i];
            b[i * 3 + c] = sb[i];
        }
        const fI = boxMean(I, w, h, 1), fO = boxMean(O, w, h, 1);
        for (let i = 0; i < n; i++) {
            eIn[i] += (I[i] - fI[i]) ** 2;
            eOut[i] += (O[i] - fO[i]) ** 2;
        }
    }
    const sIn = boxMean(eIn, w, h, radius), sOut = boxMean(eOut, w, h, radius), keep = new Float32Array(n);
    for (let i = 0; i < n; i++)
        keep[i] = sIn[i] < 3e-5 ? 1 : Math.max(0.25, Math.min(1.5, Math.sqrt(sOut[i] / sIn[i])));
    return { a, b, keep };
}
/** Bilinear sample position of full-size pixel x in a preview of `small` pixels across. */
function axis(full, small) {
    const i0 = new Int32Array(full), i1 = new Int32Array(full), t = new Float32Array(full);
    for (let x = 0; x < full; x++) {
        const p = Math.min(small - 1, Math.max(0, (x + 0.5) * small / full - 0.5)), f = Math.floor(p);
        i0[x] = f;
        i1[x] = Math.min(small - 1, f + 1);
        t[x] = p - f;
    }
    return { i0, i1, t };
}
/** Bilinear enlargement of interleaved 3-channel float planes. */
function enlarge(src, sw, sh, w, h, at) {
    const ax = axis(w, sw), ay = axis(h, sh);
    for (let y = 0; y < h; y++) {
        const r0 = ay.i0[y] * sw, r1 = ay.i1[y] * sw, ty = ay.t[y];
        for (let x = 0; x < w; x++) {
            const tx = ax.t[x];
            for (let c = 0; c < 3; c++) {
                const p00 = src[(r0 + ax.i0[x]) * 3 + c], p01 = src[(r0 + ax.i1[x]) * 3 + c], p10 = src[(r1 + ax.i0[x]) * 3 + c], p11 = src[(r1 + ax.i1[x]) * 3 + c];
                const top = p00 + (p01 - p00) * tx, bottom = p10 + (p11 - p10) * tx;
                at(x, y, c, top + (bottom - top) * ty);
            }
        }
    }
}
/** Apply a fitted model to the full-size input: the enlarged preview input carries the colour
 * model, and the full-size-only detail (full minus enlarged preview) rides on top, scaled by `keep`. */
export function applyCarry(full, model, smallIn) {
    const { width: w, height: h } = full, sw = smallIn.width, sh = smallIn.height, out = new Uint8Array(w * h * 3);
    const ax = axis(w, sw), ay = axis(h, sh), ch = smallIn.channels;
    for (let y = 0; y < h; y++) {
        const r0 = ay.i0[y] * sw, r1 = ay.i1[y] * sw, ty = ay.t[y];
        for (let x = 0; x < w; x++) {
            const tx = ax.t[x], j00 = r0 + ax.i0[x], j01 = r0 + ax.i1[x], j10 = r1 + ax.i0[x], j11 = r1 + ax.i1[x];
            const w00 = (1 - tx) * (1 - ty), w01 = tx * (1 - ty), w10 = (1 - tx) * ty, w11 = tx * ty;
            const keep = model.keep[j00] * w00 + model.keep[j01] * w01 + model.keep[j10] * w10 + model.keep[j11] * w11, i = y * w + x;
            for (let c = 0; c < 3; c++) {
                const up = (smallIn.data[j00 * ch + c] * w00 + smallIn.data[j01 * ch + c] * w01 + smallIn.data[j10 * ch + c] * w10 + smallIn.data[j11 * ch + c] * w11) / 255;
                const a = model.a[j00 * 3 + c] * w00 + model.a[j01 * 3 + c] * w01 + model.a[j10 * 3 + c] * w10 + model.a[j11 * 3 + c] * w11;
                const b = model.b[j00 * 3 + c] * w00 + model.b[j01 * 3 + c] * w01 + model.b[j10 * 3 + c] * w10 + model.b[j11 * 3 + c] * w11;
                const v = a * (up + keep * (full.data[i * full.channels + c] / 255 - up)) + b;
                out[i * 3 + c] = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
            }
        }
    }
    return { width: w, height: h, channels: 3, data: out };
}
/** How far a full-size result, shrunk to the preview size, is from the preview render. */
export function carryError(fullOut, previewOut) {
    const small = resizeArea(fullOut, previewOut.width, previewOut.height);
    const hist = new Uint32Array(256);
    let sum = 0;
    for (let i = 0; i < previewOut.width * previewOut.height; i++) {
        let d = 0;
        for (let c = 0; c < 3; c++)
            d = Math.max(d, Math.abs(small.data[i * 3 + c] - previewOut.data[i * previewOut.channels + c]));
        hist[d]++;
        sum += d;
    }
    const n = previewOut.width * previewOut.height, target = Math.ceil(n * 0.99);
    let acc = 0, p99 = 0;
    for (let d = 0; d < 256; d++) {
        acc += hist[d];
        if (acc >= target) {
            p99 = d;
            break;
        }
    }
    return { mean: sum / n, p99 };
}
/** Where the layer changed the preview (soft, slightly grown), enlarged to full size, and the
 * full-size result: the enlarged preview render inside, the full-size input outside. */
export function regionFallback(fullIn, previewIn, previewOut) {
    const { width: sw, height: sh } = previewOut, n = sw * sh;
    const changed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let d = 0;
        for (let c = 0; c < 3; c++)
            d = Math.max(d, Math.abs(previewOut.data[i * previewOut.channels + c] - previewIn.data[i * previewIn.channels + c]));
        changed[i] = d > 2 ? 1 : 0;
    }
    const grown = boxMean(changed, sw, sh, 2);
    const soft = boxMean(grown.map((v) => v > 0 ? 1 : 0), sw, sh, 1);
    const plane = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        plane[i * 3] = soft[i];
        plane[i * 3 + 1] = soft[i];
        plane[i * 3 + 2] = soft[i];
    }
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++)
        rgb[i] = previewOut.data[Math.floor(i / 3) * previewOut.channels + (i % 3)];
    const { width: w, height: h } = fullIn, out = new Uint8Array(w * h * 3), mask = new Float32Array(w * h * 3);
    enlarge(plane, sw, sh, w, h, (x, y, c, v) => { mask[(y * w + x) * 3 + c] = v; });
    enlarge(rgb, sw, sh, w, h, (x, y, c, v) => {
        const i = (y * w + x) * 3 + c, m = mask[i];
        out[i] = Math.round(fullIn.data[(y * w + x) * fullIn.channels + c] * (1 - m) + v * m);
    });
    return { width: w, height: h, channels: 3, data: out };
}
/** The whole stack at full size. `preview` is the Studio's source; `full` the same photo decoded
 * at full size (same picture, more pixels). */
export function renderFullSize(preview, layers, full) {
    const visible = effective(layers), plan = stagePlan(visible);
    const used = appearanceOrder(plan.looks).layers;
    const labels = [], metrics = [], paths = [];
    let small = copyRGB(preview.image), big = copyRGB(full);
    if (plan.develop.length) {
        small = developStage(small, plan.develop).image;
        const d = developStage(big, plan.develop);
        big = d.image;
        labels.push(...d.labels);
        metrics.push(...d.metrics);
        for (const l of plan.develop)
            paths.push({ id: l.id, name: l.name, path: "full-size" });
    }
    let face = preview.face;
    const radius = Math.max(2, Math.round(Math.min(small.width, small.height) / 120));
    const fx = full.width / preview.image.width, fy = full.height / preview.image.height;
    for (const item of used) {
        const result = applyLocalLayer(small, face === preview.face ? preview : { ...preview, face }, item);
        const weight = item.opacity * (item.kind === "lighting" ? item.strength / 100 : 1);
        const out = mixOpacity(small, result.image, weight);
        const pointsBefore = face;
        face = nextFace(face, result.face, weight);
        // A retouch brush layer's strokes are in shares of the photo: it renders on the full-size
        // pixels themselves, with the face points scaled to them (editor/brush/layer.ts).
        if (rendersAtFullSize(item)) {
            const bigFace = pointsBefore?.map((p) => [(p[0] + 0.5) * fx - 0.5, (p[1] + 0.5) * fy - 0.5]);
            const at = applyLocalLayer(big, { ...preview, image: big, face: bigFace, hair: undefined, faces: undefined }, item);
            big = mixOpacity(big, at.image, weight);
            paths.push({ id: item.id, name: item.name, path: "full-size" });
            small = out;
            labels.push(result.label);
            metrics.push({ ...result.metrics, opacity: item.opacity, strength: item.strength, simulation: item.simulation, source: item.provenance });
            continue;
        }
        // A layer that moves pixels can't be carried by a colour model: its full-size-only detail
        // would stay where it was. Known by what it reports (moved face points) or by kind.
        const moves = MOVING_KINDS.includes(item.kind) || movesPixels(item) || movedPoints(result.face, pointsBefore);
        const carried = moves ? null : applyCarry(big, fitCarry(small, out, radius), small);
        const err = carried ? carryError(carried, out) : undefined;
        if (carried && err && err.mean <= CARRY_MEAN && err.p99 <= CARRY_P99) {
            big = carried;
            paths.push({ id: item.id, name: item.name, path: "carried", ...err });
        }
        else {
            big = regionFallback(big, small, out);
            paths.push({ id: item.id, name: item.name, path: "preview-size area", ...(err ?? {}) });
        }
        small = out;
        labels.push(result.label);
        metrics.push({ ...result.metrics, opacity: item.opacity, strength: item.strength, simulation: item.simulation, source: item.provenance });
    }
    const beforeGeometry = big;
    const shaped = geometryStage(big, plan.geometry), finished = finishStage(shaped.image, plan.finish);
    labels.push(...shaped.labels, ...finished.labels);
    metrics.push(...shaped.metrics, ...finished.metrics);
    if (plan.geometry)
        paths.push({ id: plan.geometry.id, name: plan.geometry.name, path: "full-size" });
    const geometry = plan.geometry ? readGeometry(plan.geometry.parameters) : null;
    const sx = full.width / preview.image.width, sy = full.height / preview.image.height;
    const fullFace = face?.map((p) => [(p[0] + 0.5) * sx - 0.5, (p[1] + 0.5) * sy - 0.5]);
    const movedFace = geometry && !isIdentity(geometry) && fullFace ? fullFace.map((p) => {
        const q = mapToOutput(full.width, full.height, geometry, [p[0] + 0.5, p[1] + 0.5]);
        return [q[0] - 0.5, q[1] - 0.5];
    }) : fullFace;
    return { image: finished.image, labels, metrics, effective: visible.length, face: movedFace, beforeGeometry, paths,
        fullSize: paths.every((p) => p.path !== "preview-size area") };
}
/** One plain line for the status after saving. */
export function savedLine(result) {
    const soft = result.paths.filter((p) => p.path === "preview-size area").map((p) => p.name);
    const size = `${result.image.width} × ${result.image.height}`;
    return soft.length ? `Saved at full size (${size}). ${soft.join(", ")} moved or drew pixels, so inside ${soft.length === 1 ? "its area" : "their areas"} the preview-size render is used and is softer.`
        : `Saved at full size (${size}).`;
}
