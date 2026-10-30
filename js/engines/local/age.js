/** LS3 procedural age-look simulation on R4 named face masks and R6 E08 geometry.
 * Inspiration: DECA (shape/appearance layers), FLAME (expression separated from shape),
 * face-parsing.PyTorch (region-specific edits). concept only, no code copied.
 * Our own polyline, crease and seeded spot algorithms: no GANs, weights or APIs.
 * Not an age prediction. Author: John Khan.
 */
import { LANDMARKS } from "../../data/face/generated/anatomy.js";
import { CONTOURS, regionMask } from "../../data/regions/index.js";
import { floatImage, requireColour, requireMask } from "../core/buffer.js";
import { boxMean } from "../core/filters.js";
import { checkFace, faceFrame, renderShape } from "../shape/geometry.js";
export const VERSION = "age-spike-r6/1";
export const LABEL = "Age-look simulation of lines, texture and shape; not a prediction of how you will age.";
export const OLDER_STOPS = [1, 2, 3, 4, 5];
export const YOUNGER_STOPS = [-1, -2, -3];
export const LAYERS = ["lines", "texture", "spots", "jowl", "brows_lids", "lips", "colour", "hair"];
/** xorshift32: stable spots, no platform RNG and no implicit global state. */
export function random32(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new RangeError("seed must be uint32");
    let n = seed || 0x6d2b79f5;
    return () => {
        n ^= n << 13;
        n ^= n >>> 17;
        n ^= n << 5;
        n >>>= 0;
        return n / 4294967296;
    };
}
export function ageStrength(stop, strength = 1) {
    if (!Number.isInteger(stop) || stop === 0 || stop < -3 || stop > 5)
        throw new RangeError("age stop must be -3..-1 or 1..5");
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 1))
        throw new RangeError("age strength must be 0..1");
    const older = stop > 0;
    return { older, fraction: Math.abs(stop) / (older ? 5 : 3) * strength, raw: stop * strength };
}
export function checkLayers(layers) {
    const result = Object.fromEntries(LAYERS.map((id) => [id, 1]));
    for (const [id, value] of Object.entries(layers ?? {})) {
        if (!LAYERS.includes(id) || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
            throw new RangeError(`invalid age layer: ${id}`);
        }
        result[id] = value;
    }
    return result;
}
export function curvePoints(curve, steps = 24) {
    const [p, c, q] = curve, out = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, a = 1 - t;
        out.push([a * a * p[0] + 2 * a * t * c[0] + t * t * q[0],
            a * a * p[1] + 2 * a * t * c[1] + t * t * q[1]]);
    }
    return out;
}
/** Creases use named landmarks from R5 anatomy; no new face index table. */
export function creasePlan(mesh, amount) {
    checkFace(mesh);
    if (!(amount >= 0 && amount <= 1))
        throw new RangeError("crease strength must be 0..1");
    const f = faceFrame(mesh);
    const A = (id) => mesh[LANDMARKS[id]];
    const pt = (u, v) => [f.centre[0] + f.across[0] * u + f.down[0] * v,
        f.centre[1] + f.across[1] * u + f.down[1] * v];
    const strokes = [];
    const width = Math.max(0.6, f.iod * 0.012), depth = amount * 20;
    // Horizontal forehead creases are approximations anchored to the top/brow gap.
    for (let band = 0; band < 3; band++) {
        const height = -f.length * (0.13 + 0.046 * band);
        strokes.push({ curve: [pt(-0.72 * f.iod, height), pt(0, height - 0.035 * f.iod), pt(0.72 * f.iod, height)],
            width: width * (band === 2 ? 0.85 : 1), depth: depth * (0.55 + band * 0.14) });
    }
    // Crow's-feet radiate from outer corners, pointing away from the nose.
    for (const id of ["right_eye_outer", "left_eye_outer"]) {
        const a = A(id), u = id === "right_eye_outer" ? -1 : 1;
        for (const s of [-1, 0, 1]) {
            const start = [a[0] + u * f.across[0] * f.iod * 0.04, a[1] + u * f.across[1] * f.iod * 0.04];
            const control = [start[0] + (u * f.across[0] + s * 0.4 * f.down[0]) * f.iod * 0.10,
                start[1] + (u * f.across[1] + s * 0.4 * f.down[1]) * f.iod * 0.10];
            const end = [a[0] + (u * f.across[0] * 0.23 + s * f.down[0] * 0.18) * f.iod,
                a[1] + (u * f.across[1] * 0.23 + s * f.down[1] * 0.18) * f.iod];
            strokes.push({ curve: [start, control, end], width: width * 0.7, depth: depth * 0.55 });
        }
    }
    // Nasolabial folds and marionette lines follow existing nose/mouth landmarks.
    for (const [nose, mouth] of [[129, 61], [358, 291]]) {
        const n = mesh[nose], m = mesh[mouth];
        const u = nose === 129 ? -1 : 1;
        strokes.push({ curve: [[n[0], n[1] + f.iod * 0.04],
                [(n[0] + m[0]) / 2 + u * 0.05 * f.iod, (n[1] + m[1]) / 2],
                [m[0] + u * 0.06 * f.iod, m[1] + f.iod * 0.07]], width: width * 1.1, depth: depth * 0.75 });
        strokes.push({ curve: [m, [m[0] + u * f.iod * 0.10, m[1] + f.iod * 0.15],
                [m[0] + u * f.iod * 0.11, m[1] + f.iod * 0.28]], width: width, depth: depth * 0.48 });
    }
    // Under-eye bags are below the lower lid, not on the pupil or eye opening.
    for (const ids of [CONTOURS.right_eye, CONTOURS.left_eye]) {
        const x = ids.reduce((s, i) => s + mesh[i][0], 0) / ids.length;
        const y = Math.max(...ids.map((i) => mesh[i][1])) + 0.05 * f.iod;
        strokes.push({ curve: [[x - 0.24 * f.iod, y], [x, y + 0.045 * f.iod], [x + 0.24 * f.iod, y]],
            width: width * 0.8, depth: depth * 0.45 });
    }
    return strokes;
}
/** Draw a soft dark core plus a bright rim, clipped by the R4 skin mask. */
export function drawStrokes(image, skin, strokes) {
    requireMask(skin, image.width, image.height);
    const { width: w, height: h, channels } = image;
    let touched = 0, total = 0;
    const accumulated = new Float32Array(w * h);
    for (const stroke of strokes) {
        const samples = curvePoints(stroke.curve, 32), sigma = Math.max(0.5, stroke.width);
        const limit = Math.ceil(sigma * 3);
        for (const [px, py] of samples) {
            for (let y = Math.max(0, Math.floor(py - limit)); y <= Math.min(h - 1, Math.ceil(py + limit)); y++) {
                for (let x = Math.max(0, Math.floor(px - limit)); x <= Math.min(w - 1, Math.ceil(px + limit)); x++) {
                    const i = y * w + x;
                    if (skin.data[i] <= 0.001)
                        continue;
                    const dx = x - px, dy = y - py;
                    const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
                    accumulated[i] = Math.max(accumulated[i], Math.min(stroke.depth, weight * stroke.depth));
                }
            }
        }
    }
    for (let i = 0; i < accumulated.length; i++) {
        if (accumulated[i] <= 0.01)
            continue;
        const effect = accumulated[i] * skin.data[i];
        if (effect < 0.01)
            continue;
        touched++;
        total += effect;
        for (let c = 0; c < 3; c++)
            image.data[i * channels + c] = Math.max(0, Math.round(image.data[i * channels + c] - effect));
    }
    return { touched, contrast: touched ? total / touched : 0 };
}
export function renderAge(input, mesh, options) {
    requireColour(input);
    checkFace(mesh);
    const { older, fraction } = ageStrength(options.stop, options.strength);
    const layers = checkLayers(options.layers), seed = options.seed ?? 12345;
    const rand = random32(seed);
    const skin = regionMask("skin", mesh, input.width, input.height, { normalized: false, supersample: 2 });
    let output = { ...input, data: new Uint8Array(input.data) };
    const editMask = floatImage(input.width, input.height, 1);
    const f = faceFrame(mesh);
    let guardScale = 1;
    let face = mesh.map((q) => [q[0], q[1]]);
    if (layers.jowl > 0 || layers.brows_lids > 0 || layers.lips > 0) {
        const modifier = older ? 1 : -0.65;
        const geometry = renderShape(input, mesh, {
            jowl_fullness: Math.min(100, Math.max(-100, modifier * 75 * fraction * layers.jowl)),
            jaw_length: Math.min(100, Math.max(-100, modifier * 40 * fraction * layers.jowl)),
            forehead_height: Math.min(100, Math.max(-100, -modifier * 20 * fraction * layers.brows_lids)),
            chin_shape: Math.min(100, Math.max(-100, -modifier * 20 * fraction * layers.lips)),
        }, { strength: 1 });
        output = geometry.image;
        face = geometry.target;
        guardScale = geometry.metrics.guard_scale;
        for (let i = 0; i < editMask.data.length; i++)
            editMask.data[i] = geometry.editMask.data[i];
    }
    let wrinklePixels = 0, wrinkleContrast = 0, spots = 0;
    if (older && layers.lines > 0) {
        const creases = creasePlan(mesh, fraction * layers.lines);
        const result = drawStrokes(output, skin, creases);
        wrinklePixels = result.touched;
        wrinkleContrast = result.contrast;
    }
    const { width: w, height: h, channels } = output;
    // Luminance texture separation uses the existing R3 box filter. Skin mask forbids eye edits.
    const mono = floatImage(w, h, 1, true);
    for (let i = 0; i < mono.data.length; i++) {
        const j = i * channels;
        mono.data[i] = 0.2126 * output.data[j] + 0.7152 * output.data[j + 1] + 0.0722 * output.data[j + 2];
    }
    const smooth = boxMean(mono, Math.max(1, Math.round(f.iod / 30)));
    const texture = fraction * layers.texture * (older ? 0.35 : -0.48);
    const colour = fraction * layers.colour;
    for (let i = 0; i < skin.data.length; i++) {
        const alpha = skin.data[i];
        if (alpha <= 0)
            continue;
        const detail = (mono.data[i] - smooth.data[i]) * texture * alpha;
        const sign = older ? 1 : -1;
        for (let c = 0; c < 3; c++) {
            const idx = i * channels + c;
            const tone = sign * (c === 0 ? 3.0 : c === 1 ? 1.4 : -2.4) * colour * alpha;
            output.data[idx] = Math.max(0, Math.min(255, Math.round(output.data[idx] + detail + tone)));
        }
        if (texture !== 0 || colour !== 0)
            editMask.data[i] = 1;
    }
    // Deterministic sparse spots, not placed in eye, lip or eyebrow masks.
    if (older && layers.spots > 0) {
        const n = Math.ceil((f.iod ** 2) / 200 * fraction * layers.spots);
        const cx = f.centre[0], cy = f.centre[1];
        for (let j = 0; j < n; j++) {
            const px = Math.round(cx + (rand() - 0.5) * f.iod * 2.3);
            const py = Math.round(cy + (rand() - 0.45) * f.length * 0.85);
            const radius = Math.max(1, f.iod * (0.012 + rand() * 0.022));
            const strength = (7 + rand() * 15) * fraction * layers.spots;
            if (px < 0 || px >= w || py < 0 || py >= h || skin.data[py * w + px] < 0.8)
                continue;
            spots++;
            for (let y = Math.max(0, Math.floor(py - 3 * radius)); y < Math.min(h, Math.ceil(py + 3 * radius)); y++) {
                for (let x = Math.max(0, Math.floor(px - 3 * radius)); x < Math.min(w, Math.ceil(px + 3 * radius)); x++) {
                    const i = y * w + x;
                    const weight = Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * radius * radius)) * skin.data[i];
                    if (weight < 0.01)
                        continue;
                    const idx = i * channels, val = strength * weight;
                    output.data[idx] = Math.max(0, Math.round(output.data[idx] - val * 0.65));
                    output.data[idx + 1] = Math.max(0, Math.round(output.data[idx + 1] - val));
                    output.data[idx + 2] = Math.max(0, Math.round(output.data[idx + 2] - val * 1.3));
                    editMask.data[i] = 1;
                }
            }
        }
    }
    let greyPixels = 0;
    if (older && options.hairMask && layers.hair > 0) {
        const hair = requireMask(options.hairMask, w, h);
        for (let i = 0; i < hair.data.length; i++) {
            const weight = hair.data[i] * fraction * layers.hair * 0.58;
            if (weight <= 0)
                continue;
            const j = i * channels;
            const avg = 0.2126 * output.data[j] + 0.7152 * output.data[j + 1] + 0.0722 * output.data[j + 2];
            for (let c = 0; c < 3; c++)
                output.data[j + c] = Math.round(output.data[j + c] * (1 - weight) + (avg + 12) * weight);
            editMask.data[i] = 1;
            greyPixels++;
        }
    }
    // Extra mask protection: the contract Q1 mask must contain every changed pixel.
    for (let i = 0; i < w * h; i++) {
        for (let c = 0; c < 3; c++) {
            if (output.data[i * channels + c] !== input.data[i * channels + c]) {
                editMask.data[i] = 1;
                break;
            }
        }
    }
    return { image: output, editMask, layersUsed: layers, label: LABEL, face,
        metrics: { stop: options.stop, strength_used: (options.strength ?? 1) * guardScale,
            guard_scale: guardScale, wrinkle_pixels: wrinklePixels, wrinkle_contrast: wrinkleContrast,
            spots_drawn: spots, grey_pixels: greyPixels, texture_amount: texture, colour_amount: colour,
            released_photo_validated: 0, seed } };
}
//# sourceMappingURL=age.js.map