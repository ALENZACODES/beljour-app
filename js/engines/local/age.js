/** LS3 procedural age-look simulation on R4 named face masks and R6 E08 geometry.
 * Inspiration: DECA (shape/appearance layers), FLAME (expression separated from shape),
 * face-parsing.PyTorch (region-specific edits). concept only, no code copied.
 * Our own polyline, crease and seeded spot algorithms: no GANs, weights or APIs.
 * Not an age prediction. Author: John Khan.
 */
import { LANDMARKS } from "../../data/face/generated/anatomy.js";
import { CONTOURS, regionMask } from "../../data/regions/index.js";
import { floatImage, requireColour, requireMask } from "../core/buffer.js";
import { checkFace, faceFrame, renderShape } from "../shape/geometry.js";
import { renderAgeSurface } from "./age-surface.js";
import { olderFeatureTone } from "./older-tone.js";
import { brightenEyeWhites, cheekLift, eraseCreases, greyBrows, lipFullness, olderSag, recolourGrey, smoothCrepe, youngCues } from "./younger-structure.js";
import { centralSkin, findMarks, iodOf } from "../../layout/still-you.js";
import { renderClock } from "../skin/texture-law.js";
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
    // Calibrated (Batch 2): at half strength the lines must read clearly at normal viewing size.
    const width = Math.max(1, f.iod * 0.022), depth = amount * 70;
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
/** Texture Law for the reshape: bilinear resampling softens the 1 px band (pores, grain). Inside the moved
 * area the output keeps its warped low band and takes the person's own high band, carried by the same field
 * with nearest-pixel lookup so it is moved, not interpolated away. */
const BINOMIAL5 = [1, 4, 6, 4, 1];
export function relayOwnHighBand(input, output, field, moved) {
    const { width: w, height: h, channels: ch } = input;
    const blur5 = (src, c) => {
        const o = new Float64Array(w * h);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                let s = 0, k = 0;
                for (let dy = -2; dy <= 2; dy++)
                    for (let dx = -2; dx <= 2; dx++) {
                        const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy)), wt = BINOMIAL5[dx + 2] * BINOMIAL5[dy + 2];
                        s += src[(yy * w + xx) * ch + c] * wt;
                        k += wt;
                    }
                o[y * w + x] = s / k;
            }
        return o;
    };
    for (let c = 0; c < 3; c++) {
        const lowIn = blur5(input.data, c), lowOut = blur5(output.data, c);
        for (let i = 0; i < w * h; i++) {
            if (!(moved[i] > 0))
                continue;
            const sx = Math.min(w - 1, Math.max(0, Math.round(field.mapX.data[i]))), sy = Math.min(h - 1, Math.max(0, Math.round(field.mapY.data[i])));
            const j = sy * w + sx, high = input.data[j * ch + c] - lowIn[j];
            output.data[i * ch + c] = Math.max(0, Math.min(255, Math.round(lowOut[i] + high)));
        }
    }
}
export function renderAge(input, mesh, options) {
    requireColour(input);
    checkFace(mesh);
    const { older, fraction: linear } = ageStrength(options.stop, options.strength);
    // Younger responds on a gentle curve (f^0.6): the default is plainly visible, the maximum is unchanged.
    const fraction = older ? linear : Math.pow(linear, 0.6);
    const layers = checkLayers(options.layers), seed = options.seed ?? 12345;
    const started = renderClock();
    let skin = regionMask("skin", mesh, input.width, input.height, { normalized: false, supersample: 2 });
    let output = { ...input, data: new Uint8Array(input.data) };
    const editMask = floatImage(input.width, input.height, 1);
    let guardScale = 1;
    let face = mesh.map((q) => [q[0], q[1]]);
    if (layers.jowl > 0 || layers.brows_lids > 0 || layers.lips > 0) {
        // Younger lifts the jowl and jaw a little more than before (Batch 2), still inside the guard.
        const modifier = older ? 1 : -1;
        // Younger: jowls and jawline lifted harder, cheeks a little fuller, lips fuller (outer contour), all inside the guard.
        const geometry = renderShape(input, mesh, {
            jowl_fullness: Math.min(100, Math.max(-100, modifier * (older ? 75 : 100) * fraction * layers.jowl)),
            jaw_length: Math.min(100, Math.max(-100, modifier * 40 * fraction * layers.jowl)),
            forehead_height: Math.min(100, Math.max(-100, -modifier * 20 * fraction * layers.brows_lids)),
            chin_shape: Math.min(100, Math.max(-100, -modifier * 20 * fraction * layers.lips)),
            ...(older ? {} : { cheek_fullness: Math.min(100, 50 * fraction * layers.jowl) }),
        }, { strength: 1, adjust: older
                // Older: mid-face volume falls (malar pads drop) and the lips thin, the reverse of Younger
                ? (t) => olderSag(mesh, cheekLift(mesh, lipFullness(mesh, t, -0.025 * fraction * layers.lips), -0.03 * fraction * layers.jowl), fraction * layers.brows_lids)
                : (t) => cheekLift(mesh, lipFullness(mesh, t, 0.03 * fraction * layers.lips), 0.025 * fraction * layers.jowl) });
        output = geometry.image;
        if (geometry.field)
            relayOwnHighBand(input, output, geometry.field, geometry.editMask.data);
        face = geometry.target;
        skin = regionMask("skin", face, input.width, input.height, { normalized: false, supersample: 2 });
        guardScale = geometry.metrics.guard_scale;
        for (let i = 0; i < editMask.data.length; i++)
            editMask.data[i] = geometry.editMask.data[i];
    }
    // Surface (lines, texture, colour, spots) on the person's own skin: own creases deepened or healed,
    // pores and moles never treated as lines, brown spots as melanin, all lit by the photo's own light.
    // Replaces the stroke drawing, the RGB tone wash and the one-band blur.
    // Younger holds the marks the photo check counts (found on the input, before any change).
    const keepMarks = older ? undefined : findMarks(input, regionMask("skin", mesh, input.width, input.height, { normalized: false, supersample: 2 }), iodOf(input.width, mesh));
    const surface = renderAgeSurface(output, skin, face, { older, fraction, iod: faceFrame(face).iod, keepMarks,
        // Older places no brown spots (synthesised marks); Younger never placed any.
        lines: layers.lines, colour: layers.colour, texture: layers.texture, spots: older ? 0 : layers.spots, seed,
        // Soft segmenter confidence is non-zero almost everywhere; only real hair (>= 0.3) is kept out of the skin.
        excluded: options.hairMask ? Float64Array.from(options.hairMask.data, (v) => (v >= 0.3 ? v : 0)) : undefined, mesh3: mesh });
    output = surface.image;
    for (let i = 0; i < editMask.data.length; i++)
        editMask.data[i] = Math.max(editMask.data[i], surface.edit[i]);
    const wrinklePixels = surface.wrinklePixels, wrinkleContrast = surface.wrinkleContrast, spots = surface.spots;
    const texture = fraction * layers.texture, colour = fraction * layers.colour;
    const { width: w, height: h, channels } = output;
    let creasePixels = 0, greyPixels = 0, eyeWhitePixels = 0, hairColourPixels = 0, greyBefore = 0, greyAfter = 0, hairHighBand = 1;
    if (!older) {
        // Lines out, own pores in (the wrinkles live in the high band the surface pass keeps).
        const hold = new Float64Array(w * h);
        // every mark on the edited skin (face AND neck) is held out of the line eraser, not only the face-check ones
        const supportMask = floatImage(w, h, 1);
        for (let i = 0; i < w * h; i++)
            supportMask.data[i] = surface.edit[i];
        const iodM = iodOf(input.width, mesh), holdMarks = [...(keepMarks ?? []), ...findMarks(input, supportMask, iodM), ...findMarks(input, centralSkin(w, h), iodM)];
        for (const m of holdMarks) {
            const r = m.radius + 2;
            for (let y = Math.max(0, Math.floor(m.y - r)); y <= Math.min(h - 1, Math.ceil(m.y + r)); y++)
                for (let x = Math.max(0, Math.floor(m.x - r)); x <= Math.min(w - 1, Math.ceil(m.x + r)); x++)
                    if ((x - m.x) ** 2 + (y - m.y) ** 2 <= r * r)
                        hold[y * w + x] = 1;
        }
        const cr = eraseCreases(output, surface.edit, face, Math.min(1, 1.25 * Math.pow(fraction, 0.8)) * layers.lines, hold);
        creasePixels = cr.creasePixels;
        smoothCrepe(output, surface.edit, face, Math.pow(fraction, 0.8) * layers.texture, hold);
        youngCues(output, surface.edit, face, fraction * layers.colour);
        eyeWhitePixels = brightenEyeWhites(output, face, fraction * layers.colour);
        if (options.hairMask && layers.hair > 0) {
            const hair = requireMask(options.hairMask, w, h);
            const rc = recolourGrey(output, hair.data, face, Math.min(1, 1.1 * fraction) * layers.hair, seed + 9);
            hairColourPixels = rc.pixels;
            greyBefore = rc.greyShareBefore;
            greyAfter = rc.greyShareAfter;
            hairHighBand = rc.highBandRatio;
        }
    }
    if (older) {
        // The r4 skin approach in reverse: own crepe up (cored, own texture), cheeks less even, sallower, duller, paler
        // lips, thinner brows. Marks the photo check counts are held.
        const hold = new Float64Array(w * h), iodM = iodOf(input.width, mesh);
        for (const m of findMarks(input, centralSkin(w, h), iodM)) {
            const r = m.radius + 2;
            for (let y = Math.max(0, Math.floor(m.y - r)); y <= Math.min(h - 1, Math.ceil(m.y + r)); y++)
                for (let x = Math.max(0, Math.floor(m.x - r)); x <= Math.min(w - 1, Math.ceil(m.x + r)); x++)
                    if ((x - m.x) ** 2 + (y - m.y) ** 2 <= r * r)
                        hold[y * w + x] = 1;
        }
        const img = output;
        // own crepe and fine-line band raised 1.3-1.6x where it already exists (cored: structure is left alone)
        smoothCrepe(img, surface.edit, face, -0.6 * Math.sqrt(fraction) * layers.texture, hold);
        // workstream 01 ideas 3+4: brow and lip contrast against the skin down (coarse layer only), limbal ring and whites dulled
        const tone = olderFeatureTone(img, face, fraction * layers.colour);
        img.data.set(tone.image.data);
    }
    if (older && options.hairMask && layers.hair > 0 && options.greyMode === "wash") {
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
    // Local strand greying is off (John, 7:54 PM: it "looks fake"); grey hair comes from YouCam Hair Color, colour only,
    // on the Older (YouCam) path. Locally her hair is left unchanged rather than faked.
    if (older && layers.hair > 0)
        greyPixels += greyBrows(output, face, 0.18 * fraction * layers.hair);
    if (options.keepHair && options.hairMask) {
        const hair = requireMask(options.hairMask, w, h);
        for (let i = 0; i < w * h; i++) {
            const m = hair.data[i];
            if (m < 0.15)
                continue;
            const t = m >= 0.5 ? 1 : (m - 0.15) / 0.35, j = i * channels;
            for (let c = 0; c < 3; c++)
                output.data[j + c] = t === 1 ? input.data[j + c] : Math.round(output.data[j + c] * (1 - t) + input.data[j + c] * t);
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
            spots_drawn: spots, grey_pixels: greyPixels, eye_white_pixels: eyeWhitePixels, crease_pixels: creasePixels, hair_colour_pixels: hairColourPixels,
            hair_grey_share_before: greyBefore, hair_grey_share_after: greyAfter, hair_high_band_ratio: hairHighBand, texture_amount: texture, colour_amount: colour,
            released_photo_validated: 0, seed, render_ms: renderClock() - started,
            pore_band_ratio: surface.poreRatio, skin_expanded_pixels: surface.expandedSkin,
            skin_coverage_verified: surface.coverageVerified ? 1 : 0, crease_energy_ratio: surface.creaseEnergyRatio,
            own_line_share: surface.ownLineShare, forehead_spacing_cv: surface.foreheadSpacingCV,
            marks_before: surface.marksBefore, marks_after: surface.marksAfter,
            marks_kept: surface.marksBefore ? Math.min(1.5, surface.marksAfter / surface.marksBefore) : 1, light_r2: surface.lightR2 } };
}
