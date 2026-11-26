/** R16 Lane C: an on-device short-sides *tonal simulation*; no generated hair.
 * Inputs are original pixels, caller-cleared hair/scalp mask and head landmarks.
 * Bitwise outside-mask preservation and Python parity are contractual.
 * Author: John Khan.
 */
import { EXTENDED_FAMILIES, PATTERNS, PRESENTATIONS, familyRatio, spatialAt } from "./advanced.js";
import { gradedField, validateGraded } from "./graded.js";
import { activeDetail, detailField, validateDetail } from "./detailing.js";
export const VERSION = "menshair-r16c/1";
export const SIMULATION_LABEL = "Local tonal haircut simulation. No strands removed or haircut outcome predicted.";
export const FADE_START = { low: 0.80, mid: 0.62, high: 0.43 };
export const FAMILIES = ["fade", "taper", "undercut", "crew", "side-part", "crop", "buzz", ...EXTENDED_FAMILIES];
const TOPS = ["natural", "short", "parted", "textured"];
const PARTS = ["none", "left", "right"];
const POINTS = ["left_temple", "right_temple", "crown", "left_ear", "right_ear", "nape"];
export const DEFAULT_ANCHORS = {
    left_temple: [0.28, 0.34], right_temple: [0.72, 0.34], crown: [0.5, 0.11],
    left_ear: [0.24, 0.59], right_ear: [0.76, 0.59], nape: [0.5, 0.83],
};
export function validateAnchors(value) {
    for (const key of POINTS) {
        const p = value[key];
        if (!Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
            throw Error("Hair landmarks must be normalized finite coordinates.");
        }
    }
    const [lt, rt, crown, le, re, nape] = POINTS.map((key) => value[key]);
    if (!(lt[0] + .05 < rt[0] && crown[1] + .05 < Math.min(le[1], re[1]) &&
        Math.max(le[1], re[1]) < nape[1] && Math.abs(lt[1] - rt[1]) <= .15 &&
        Math.abs(le[1] - re[1]) <= .15)) {
        throw Error("Hair landmarks must describe a roughly forward-facing upright head.");
    }
}
export function validateRecipe(p) {
    if (typeof p.id !== "string" || !p.id.startsWith("local-") || typeof p.name !== "string" ||
        p.name.length < 8 || p.name.length > 90 || !FAMILIES.includes(p.family) ||
        !Object.prototype.hasOwnProperty.call(FADE_START, p.fade) || !TOPS.includes(p.top) ||
        !PARTS.includes(p.part) || !Number.isInteger(p.buzz_grade) || p.buzz_grade < 0 ||
        p.buzz_grade > 4 || (p.family !== "buzz" && p.buzz_grade !== 0) ||
        !Number.isInteger(p.strength) || p.strength < 0 || p.strength > 100) {
        throw Error("Invalid local hairstyle simulation recipe.");
    }
    if (p.pattern !== undefined && !PATTERNS.includes(p.pattern))
        throw Error("Unknown texture pattern.");
    if (p.presentation !== undefined && !PRESENTATIONS.includes(p.presentation))
        throw Error("Unknown browse category.");
    for (const key of ["top_bias", "side_bias", "fringe", "length", "definition"]) {
        const value = p[key];
        if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 100)) {
            throw Error("Invalid bounded hairstyle parameter: " + key);
        }
    }
    if (p.flow !== undefined && (!Number.isInteger(p.flow) || p.flow < -100 || p.flow > 100)) {
        throw Error("Invalid sweep direction.");
    }
    validateGraded(p);
    if (p.detail !== undefined) {
        if (!p.detail || typeof p.detail !== "object" || Array.isArray(p.detail))
            throw Error("Invalid haircut detail.");
        const knownDetail = new Set(["edge", "neckline", "temple", "parting", "crown_volume",
            "fringe_drop", "texture_tightness", "edge_softness", "temple_width", "nape_height",
            "part_contrast", "part_offset", "direction"]);
        if (Object.keys(p.detail).some((k) => !knownDetail.has(k)))
            throw Error("Unknown haircut detail field.");
        validateDetail(p.detail);
    }
    const known = new Set(["id", "name", "family", "fade", "top", "buzz_grade", "part", "strength",
        "pattern", "presentation", "top_bias", "side_bias", "fringe", "flow", "length", "definition",
        "fade_shape", "side_grade", "top_grade", "blend_width", "detail"]);
    if (Object.keys(p).some((key) => !known.has(key)))
        throw Error("Unknown hairstyle renderer field.");
}
export function validatePresets(source) {
    if (source === null || typeof source !== "object" || Array.isArray(source))
        throw Error("Invalid hairstyle source.");
    const s = source;
    if (s.format !== "beljour-menshair-r16c/1" || s.author !== "John Khan" ||
        s.simulation_label !== SIMULATION_LABEL || !Array.isArray(s.styles) || s.styles.length < 12) {
        throw Error("Uncleared hairstyle recipe set.");
    }
    const ids = new Set();
    for (const recipe of s.styles) {
        validateRecipe(recipe);
        if (ids.has(recipe.id))
            throw Error("Duplicate hairstyle id.");
        ids.add(recipe.id);
    }
}
export function requireStyle(source, id) {
    validatePresets(source);
    const result = source.styles.find((p) => p.id === id);
    if (!result)
        throw Error("This is not a listed local hairstyle.");
    return result;
}
export function smoothstep(lo, hi, x) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo)
        throw Error("Invalid smoothstep thresholds.");
    const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}
function headFrame(x, y, width, height, anchors) {
    const normalizedX = (x + 0.5) / width;
    const normalizedY = (y + 0.5) / height;
    const midpoint = (anchors.left_temple[0] + anchors.right_temple[0]) / 2;
    const half = (anchors.right_temple[0] - anchors.left_temple[0]) / 2;
    const earY = (anchors.left_ear[1] + anchors.right_ear[1]) / 2;
    return [(normalizedX - midpoint) / Math.max(half, 0.01),
        (normalizedY - anchors.crown[1]) / Math.max(earY - anchors.crown[1], 0.01)];
}
export function fadeAt(u, v, height) {
    const side = smoothstep(.34, .94, Math.abs(u));
    const start = FADE_START[height];
    return side * smoothstep(start - .13, start + .11, v);
}
export function fadeCoverage(width, height, anchors, fade) {
    validateDimensions(width, height);
    validateAnchors(anchors);
    if (!Object.prototype.hasOwnProperty.call(FADE_START, fade))
        throw Error("Unknown fade.");
    const out = new Float64Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const [u, v] = headFrame(x, y, width, height, anchors);
            out[y * width + x] = fadeAt(u, v, fade);
        }
    }
    return out;
}
export function validateDimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 ||
        width * height > 24_000_000)
        throw Error("Unsupported hairstyle render dimensions.");
}
export function fieldAt(x, y, width, height, anchors, recipe) {
    const [u, v] = headFrame(x, y, width, height, anchors);
    let field = fadeAt(u, v, recipe.fade) * .80;
    if (recipe.family === "taper") {
        const proximity = smoothstep(.68, 1, Math.abs(u));
        field *= .55 + .45 * proximity;
    }
    else if (recipe.family === "undercut") {
        field = smoothstep(.45, .58, Math.abs(u)) * smoothstep(.30, .37, v);
    }
    else if (recipe.family === "crew") {
        const top = 1 - smoothstep(.08, .55, v);
        field = Math.max(field, .12 * top);
    }
    else if (recipe.family === "crop") {
        const top = 1 - smoothstep(.09, .60, v);
        const texture = ((x * 17 + y * 29 + ((x * y) % 13) * 7) % 101) / 100;
        field = Math.max(field, top * (.09 + .12 * texture));
    }
    else if (recipe.family === "buzz") {
        field = Math.max(field * .35, .61 - .105 * recipe.buzz_grade);
    }
    if (recipe.part !== "none") {
        const direction = recipe.part === "left" ? -1 : 1;
        const ridge = 1 - smoothstep(.006, .035, Math.abs(u - direction * .27));
        const top = 1 - smoothstep(.28, .60, v);
        field = Math.max(field, .52 * ridge * top);
    }
    if (EXTENDED_FAMILIES.includes(recipe.family) ||
        (recipe.pattern ?? "plain") !== "plain" || (recipe.top_bias ?? 0) !== 0 ||
        (recipe.side_bias ?? 0) !== 0 || (recipe.fringe ?? 0) !== 0 || (recipe.flow ?? 0) !== 0 ||
        (recipe.length ?? 0) !== 0 || (recipe.definition ?? 50) !== 50) {
        field = Math.max(field, spatialAt(u, v, x, y, recipe.family, recipe));
    }
    return Math.max(0, Math.min(1, field * recipe.strength / 100));
}
export function effectField(width, height, anchors, recipe) {
    validateDimensions(width, height);
    validateAnchors(anchors);
    validateRecipe(recipe);
    const result = new Float64Array(width * height);
    const graded = recipe.fade_shape !== undefined && recipe.fade_shape !== "classic" ||
        (recipe.side_grade ?? 1) !== 1 || (recipe.top_grade ?? 4) !== 4 || (recipe.blend_width ?? 45) !== 45
        ? gradedField(width, height, anchors, recipe) : null;
    const detail = recipe.detail && activeDetail(recipe.detail)
        ? detailField(width, height, anchors, recipe.detail) : null;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            const base = detail ? Math.max(fieldAt(x, y, width, height, anchors, recipe), detail[i] * recipe.strength / 100) : fieldAt(x, y, width, height, anchors, recipe);
            if (!graded) {
                result[i] = base;
                continue;
            }
            const intensity = ((.67 + (4 - graded.grade[i]) * .036) * graded.blend[i] +
                .12 * graded.transition[i]) * recipe.strength / 100;
            result[i] = Math.max(0, Math.min(1, Math.max(base, intensity)));
        }
    }
    return result;
}
function normalizedMask(mask, width, height) {
    if (mask.length !== width * height)
        throw Error("Mask size differs from source image.");
    const byte = mask instanceof Uint8Array || mask instanceof Uint8ClampedArray;
    const out = new Float64Array(mask.length);
    for (let index = 0; index < mask.length; index += 1) {
        const value = mask[index];
        if (!Number.isFinite(value) || value < 0 || value > (byte ? 255 : 1))
            throw Error("Mask coverage is invalid.");
        out[index] = byte ? value / 255 : value;
    }
    return out;
}
export function renderStyle(image, width, height, hairMask, anchors, recipe, scalpMask = null, scalpRgb = [132, 99, 83]) {
    validateDimensions(width, height);
    validateRecipe(recipe);
    validateAnchors(anchors);
    if (scalpRgb.length !== 3 || scalpRgb.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
        throw Error("Scalp sample colour must be three bounded RGB integers.");
    }
    const n = width * height;
    const channels = image.length / n;
    if ((channels !== 3 && channels !== 4) || !Number.isInteger(channels))
        throw Error("Expected RGB or RGBA image bytes.");
    const hair = normalizedMask(hairMask, width, height);
    const scalp = scalpMask ? normalizedMask(scalpMask, width, height) : null;
    const field = effectField(width, height, anchors, recipe);
    const result = new Uint8Array(image);
    const ratio = recipe.family === "undercut" || recipe.family === "buzz" ? .75 : familyRatio(recipe.family);
    let affectedPixels = 0;
    let supportPixels = 0;
    for (let pixel = 0; pixel < n; pixel += 1) {
        const support = Math.max(hair[pixel], scalp?.[pixel] ?? 0);
        const strength = field[pixel] * support;
        if (support > 0)
            supportPixels += 1;
        if (strength > 0 && support > 0)
            affectedPixels += 1;
        if (!strength)
            continue;
        for (let channel = 0; channel < 3; channel += 1) {
            const old = image[pixel * channels + channel];
            const target = old * (1 - ratio) + scalpRgb[channel] * ratio;
            result[pixel * channels + channel] = Math.floor(old * (1 - strength) + target * strength + .5);
        }
    }
    return { pixels: result, evidence: { version: VERSION, style_id: recipe.id, source: "local",
            simulation: true, label: SIMULATION_LABEL, affected_pixels: affectedPixels,
            total_pixels: n, mask_support_pixels: supportPixels, provider_calls: 0,
            note: "Tonal guide only; no strand segmentation, hair removal or restored scalp." } };
}
//# sourceMappingURL=render.js.map