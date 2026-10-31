/** R18 mask-gated cosmetic fibre overlay and before/after comparison.
 * Python mirror: api/plumb_api/engines/menshair/concealer_link.py.
 * No hair is grown, inserted into the silhouette or classified from user photos.
 * Existing concealer density is passed as a typed matrix by the caller.
 * The only modified pixels are in the caller-authorized scalp mask and region.
 */
import { validateAnchors } from "./render.js";
const MAX_PIXELS = 4_000_000;
export const FIBRE_LABEL = "Local hair-fibre appearance simulation; not hair restoration";
const REGION_OPTIONS = new Set(["crown", "hairline", "both"]);
const DEFAULT_OPTIONS = {
    region: "both", strength: 65, density_gain: 80, hair_rgb: [69, 48, 38], seed: 37,
};
function smooth(low, high, x) {
    const t = Math.max(0, Math.min(1, (x - low) / (high - low)));
    return t * t * (3 - 2 * t);
}
function normalizeMask(src, width, height, name) {
    if (src.length !== width * height)
        throw Error(`${name} has the wrong dimensions.`);
    const byte = src instanceof Uint8Array || src instanceof Uint8ClampedArray;
    const result = new Float64Array(src.length);
    for (let i = 0; i < src.length; i += 1) {
        const value = src[i];
        if (!Number.isFinite(value) || value < 0 || value > (byte ? 255 : 1)) {
            throw Error(`${name} contains invalid density coverage.`);
        }
        result[i] = byte ? value / 255 : value;
    }
    return result;
}
function validateOptions(raw) {
    const p = { ...DEFAULT_OPTIONS, ...raw };
    if (!REGION_OPTIONS.has(p.region))
        throw Error("Choose crown, hairline or both.");
    for (const field of ["strength", "density_gain"]) {
        if (!Number.isInteger(p[field]) || p[field] < 0 || p[field] > 100) {
            throw Error("Fibre strength and density gain must be in 0..100.");
        }
    }
    if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 65535)
        throw Error("Invalid fibre seed.");
    if (!Array.isArray(p.hair_rgb) || p.hair_rgb.length !== 3 ||
        p.hair_rgb.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
        throw Error("Fibre reference colour must contain three RGB bytes.");
    }
    return p;
}
export function regionField(width, height, a, region) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 8 ||
        width * height > MAX_PIXELS)
        throw Error("Invalid size for fibre region.");
    if (!REGION_OPTIONS.has(region))
        throw Error("Invalid fibre region.");
    validateAnchors(a);
    const n = width * height, result = new Float64Array(n);
    const centre = (a.left_temple[0] + a.right_temple[0]) / 2;
    const half = Math.max((a.right_temple[0] - a.left_temple[0]) / 2, .01);
    const ear = (a.left_ear[1] + a.right_ear[1]) / 2;
    const heightSpan = Math.max(ear - a.crown[1], .01);
    for (let y = 0; y < height; y += 1) {
        const v = ((y + .5) / height - a.crown[1]) / heightSpan;
        for (let x = 0; x < width; x += 1) {
            const u = ((x + .5) / width - centre) / half;
            const crown = 1 - smooth(.45, 1.05, Math.sqrt((u / .87) ** 2 + ((v - .09) / .60) ** 2));
            const hairline = (1 - smooth(.47, 1.03, Math.abs(u))) *
                smooth(-.26, -.04, v) * (1 - smooth(.34, .61, v));
            const value = region === "crown" ? crown : region === "hairline" ? hairline : Math.max(crown, hairline);
            result[y * width + x] = Math.max(0, Math.min(1, value));
        }
    }
    return result;
}
function srgbLab(rgb) {
    const linear = rgb.map((byte) => {
        const x = byte / 255;
        return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
    });
    const [r, g, b] = linear;
    const x = (.4124564 * r + .3575761 * g + .1804375 * b) / .95047;
    const y = .2126729 * r + .7151522 * g + .0721750 * b;
    const z = (.0193339 * r + .1191920 * g + .9503041 * b) / 1.08883;
    const f = (v) => v > .008856451679 ? Math.cbrt(v) : 7.787037037 * v + 16 / 116;
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function colourDeltaE76(left, right) {
    const a = srgbLab(left), b = srgbLab(right);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function median(values) {
    values.sort((a, b) => a - b);
    const count = values.length;
    return count % 2 ? values[Math.floor(count / 2)] : (values[count / 2 - 1] + values[count / 2]) / 2;
}
function sampleHair(image, channels, hair, defaultHair) {
    const colours = [[], [], []];
    for (let i = 0; i < hair.length; i += 1) {
        if (hair[i] <= .95)
            continue;
        for (let ch = 0; ch < 3; ch += 1)
            colours[ch].push(image[channels * i + ch]);
    }
    if (colours[0].length < 8)
        return defaultHair;
    return colours.map((v) => Math.floor(median(v) + .5));
}
/** Local density matrix interface supplied by the pre-existing concealer engine.
 * Returning a fabricated density for absent/unverified engines would be misleading.
 */
export function requireConcealerDensity(value, width, height) {
    if (!(value instanceof Uint8Array || value instanceof Uint8ClampedArray ||
        value instanceof Float32Array || value instanceof Float64Array)) {
        throw Error("A validated density map from the local concealer engine is required.");
    }
    return normalizeMask(value, width, height, "concealer density");
}
export function renderFibres(image, width, height, hairMask, scalpMask, densityMap, anchors, raw = {}, sampleHairColour = false) {
    const p = validateOptions(raw);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 8 ||
        width * height > MAX_PIXELS)
        throw Error("Unsupported fibre image dimensions.");
    const count = width * height, channels = image.length / count;
    if (!Number.isInteger(channels) || (channels !== 3 && channels !== 4)) {
        throw Error("Fibre image must contain RGB or RGBA bytes.");
    }
    const hair = normalizeMask(hairMask, width, height, "hair mask");
    const scalp = normalizeMask(scalpMask, width, height, "scalp mask");
    const density = normalizeMask(densityMap, width, height, "density map");
    const region = regionField(width, height, anchors, p.region);
    const colour = sampleHairColour ? sampleHair(image, channels, hair, p.hair_rgb) : p.hair_rgb;
    const before = new Uint8Array(image), after = new Uint8Array(image);
    const densityBefore = density.slice(), densityAfter = density.slice();
    let supportWeight = 0, beforeVisible = 0, afterVisible = 0, eligiblePixels = 0, alteredPixels = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            const eligible = scalp[i] * region[i] * (1 - hair[i]);
            const previous = density[i];
            if (eligible > .001)
                eligiblePixels += 1;
            supportWeight += eligible;
            beforeVisible += (1 - previous) * eligible;
            const hashA = (x * 19 + y * 31 + ((x * y) % 37) * 7 + p.seed * 13) % 257;
            const hashB = (x * 43 + y * 11 + ((x + y) % 23) * 5 + p.seed * 3) % 251;
            const variation = .64 + .20 * hashA / 256 + .16 * hashB / 250;
            const coverage = Math.max(0, Math.min(1, eligible * (1 - previous) *
                p.strength / 100 * p.density_gain / 100 * variation));
            const denAfter = Math.max(0, Math.min(1, previous + (1 - previous) * coverage));
            densityAfter[i] = denAfter;
            afterVisible += (1 - denAfter) * eligible;
            let altered = false;
            for (let ch = 0; ch < 3; ch += 1) {
                const old = image[i * channels + ch];
                const value = Math.floor(old * (1 - coverage) + colour[ch] * coverage + .5);
                after[i * channels + ch] = value;
                altered ||= old !== value;
            }
            alteredPixels += Number(altered);
        }
    }
    const scalpBefore = supportWeight ? beforeVisible / supportWeight : 0;
    const scalpAfter = supportWeight ? afterVisible / supportWeight : 0;
    const metrics = {
        scalp_show_before: scalpBefore,
        scalp_show_after: scalpAfter,
        coverage_gain: Math.max(0, scalpBefore - scalpAfter),
        colour_delta_e76: colourDeltaE76(colour, p.hair_rgb),
        eligible_pixels: eligiblePixels, altered_pixels: alteredPixels,
        provider_calls: 0, simulated: true,
    };
    return { before, after, density_before: densityBefore, density_after: densityAfter,
        metrics, label: FIBRE_LABEL };
}
