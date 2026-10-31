import { colourDeltaE76, renderFibres } from './concealer-link.js';
export const SWATCHES = [
    { id: 'local-black-ink', name: 'Deep ink black', rgb: [27, 29, 33], family: 'natural', note: 'Fictional deep-neutral colour example' },
    { id: 'local-black-warm', name: 'Warm black', rgb: [38, 31, 27], family: 'natural', note: 'Fictional warm-black colour example' },
    { id: 'local-espresso', name: 'Deep espresso', rgb: [52, 37, 31], family: 'natural', note: 'Fictional deep-brown colour example' },
    { id: 'local-cocoa', name: 'Cocoa brown', rgb: [72, 51, 43], family: 'natural', note: 'Fictional cocoa-brown colour example' },
    { id: 'local-umber', name: 'Soft umber', rgb: [91, 67, 52], family: 'natural', note: 'Fictional mid-brown colour example' },
    { id: 'local-chestnut', name: 'Chestnut brown', rgb: [111, 69, 48], family: 'natural', note: 'Fictional warm-brown colour example' },
    { id: 'local-hazel', name: 'Hazel brown', rgb: [130, 91, 62], family: 'natural', note: 'Fictional golden-brown colour example' },
    { id: 'local-copper', name: 'Muted copper', rgb: [143, 75, 54], family: 'natural', note: 'Fictional copper-shade colour example' },
    { id: 'local-sand', name: 'Sandy brown', rgb: [153, 123, 89], family: 'natural', note: 'Fictional muted-sand colour example' },
    { id: 'local-flax', name: 'Flax gold', rgb: [190, 159, 107], family: 'natural', note: 'Fictional lighter-gold colour example' },
    { id: 'local-ash-blond', name: 'Muted ash blond', rgb: [166, 156, 133], family: 'natural', note: 'Fictional ash-blond colour example' },
    { id: 'local-cloud', name: 'Cloud silver', rgb: [190, 187, 183], family: 'grey', note: 'Fictional silver-grey colour example' },
    { id: 'local-pewter', name: 'Dark pewter', rgb: [117, 118, 121], family: 'grey', note: 'Fictional medium-grey colour example' },
    { id: 'local-stone', name: 'Stone grey', rgb: [150, 151, 150], family: 'grey', note: 'Fictional neutral-grey colour example' },
    { id: 'local-snow', name: 'Soft white', rgb: [220, 216, 210], family: 'grey', note: 'Fictional pale-grey colour example' },
    { id: 'local-blue-night', name: 'Blue night', rgb: [38, 58, 102], family: 'creative', note: 'Fictional muted-blue colour example' },
    { id: 'local-forest', name: 'Forest green', rgb: [46, 83, 69], family: 'creative', note: 'Fictional muted-green colour example' },
    { id: 'local-plum', name: 'Deep plum', rgb: [91, 53, 88], family: 'creative', note: 'Fictional plum-toned colour example' },
    { id: 'local-rosewood', name: 'Muted rosewood', rgb: [139, 80, 92], family: 'creative', note: 'Fictional rosewood colour example' },
    { id: 'local-cobalt', name: 'Soft cobalt', rgb: [60, 91, 152], family: 'creative', note: 'Fictional cobalt-toned colour example' },
    { id: 'local-auburn', name: 'Auburn copper', rgb: [115, 55, 46], family: 'natural', note: 'Fictional auburn-copper colour example' },
    { id: 'local-walnut', name: 'Walnut brown', rgb: [83, 58, 45], family: 'natural', note: 'Fictional walnut-brown colour example' },
];
const BY_ID = new Map(SWATCHES.map(x => [x.id, x]));
export function swatch(id) {
    const row = BY_ID.get(id);
    if (!row)
        throw Error('Unknown locally authored hair colour');
    return row;
}
export function validateColourOptions(raw) {
    swatch(raw.swatch_id);
    const p = {
        swatch_id: raw.swatch_id, strength: raw.strength ?? 65,
        preserve_highlights: raw.preserve_highlights ?? 60, region: raw.region ?? 'all',
        feather: raw.feather ?? 40, seed: raw.seed ?? 0,
    };
    if (!['all', 'crown', 'roots', 'sides'].includes(p.region))
        throw Error('Invalid tint region');
    for (const key of ['strength', 'preserve_highlights', 'feather']) {
        if (!Number.isInteger(p[key]) || p[key] < 0 || p[key] > 100)
            throw Error(`Invalid ${key}`);
    }
    if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 65535)
        throw Error('Invalid tint seed');
    return p;
}
function dims(pixels, w, h) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w * h > 4_000_000) {
        throw Error('Unsafe hair colour dimensions');
    }
    const channels = pixels.length / (w * h);
    if (!Number.isInteger(channels) || (channels !== 3 && channels !== 4))
        throw Error('Expected RGB/RGBA pixels');
    return channels;
}
function coverage(mask, w, h) {
    if (mask.length !== w * h)
        throw Error('Hair mask length mismatch');
    const bytes = mask instanceof Uint8Array || mask instanceof Uint8ClampedArray;
    const out = new Float64Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
        const v = mask[i];
        if (!Number.isFinite(v) || v < 0 || v > (bytes ? 255 : 1))
            throw Error('Invalid hair coverage');
        out[i] = bytes ? v / 255 : v;
    }
    return out;
}
function smooth(a, b, v) {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
export function colourRegion(w, h, a, region, feather) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w * h > 4_000_000) {
        throw Error('Unsafe hair tint dimensions');
    }
    if (!['all', 'crown', 'roots', 'sides'].includes(region))
        throw Error('Unknown region');
    if (!Number.isInteger(feather) || feather < 0 || feather > 100)
        throw Error('Invalid feather');
    const out = new Float64Array(w * h);
    if (region === 'all') {
        out.fill(1);
        return out;
    }
    const mid = (a.left_temple[0] + a.right_temple[0]) * .5;
    const half = Math.max((a.right_temple[0] - a.left_temple[0]) * .5, .01);
    const ear = (a.left_ear[1] + a.right_ear[1]) * .5;
    const span = Math.max(.01, ear - a.crown[1]);
    const transition = .03 + feather / 100 * .22;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const p = y * w + x;
            const u = ((x + .5) / w - mid) / half;
            const v = ((y + .5) / h - a.crown[1]) / span;
            if (region === 'roots')
                out[p] = Math.max(0, Math.min(1, (1 - smooth(.11 + transition, .33 + transition, v)) * (1 - smooth(.84, 1.24, Math.abs(u)))));
            else if (region === 'sides')
                out[p] = smooth(.33 - transition, .88 + transition, Math.abs(u)) *
                    (1 - smooth(1.14, 1.70, v));
            else {
                const radius = Math.sqrt((u / .94) ** 2 + ((v - .15) / .75) ** 2);
                out[p] = 1 - smooth(.32 + transition, 1 + transition, radius);
            }
        }
    return out;
}
export function sampleReference(image, mask, w, h, fallback) {
    const channels = dims(image, w, h);
    const area = coverage(mask, w, h);
    const stride = Math.max(1, Math.ceil(w * h / 2048));
    const values = [[], [], []];
    for (let p = 0; p < w * h; p += stride) {
        if (area[p] < .95)
            continue;
        for (let c = 0; c < 3; c++)
            values[c].push(image[p * channels + c]);
    }
    const count = values[0].length;
    if (count < 8)
        return { colour: [...fallback], count };
    const result = values.map(v => {
        v.sort((a, b) => a - b);
        const mid = Math.floor(count / 2);
        const median = count % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
        return Math.floor(median + .5);
    });
    return { colour: [result[0], result[1], result[2]], count };
}
export function rankSwatches(rgb, family = null, limit = 7) {
    if (rgb.length !== 3 || rgb.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
        throw Error('Invalid explicit hair colour reference');
    }
    if (family !== null && !['natural', 'grey', 'creative'].includes(family))
        throw Error('Unknown family');
    if (!Number.isInteger(limit) || limit < 1 || limit > SWATCHES.length)
        throw Error('Invalid rank size');
    return SWATCHES.filter(row => family === null || row.family === family).map(row => ({
        swatch: row, delta_e76: colourDeltaE76(rgb, row.rgb),
    })).sort((a, b) => Math.round(a.delta_e76 * 1e9) - Math.round(b.delta_e76 * 1e9) ||
        a.swatch.id.localeCompare(b.swatch.id, 'en')).slice(0, limit);
}
export function renderColour(image, w, h, mask, anchors, options) {
    const p = validateColourOptions(options);
    const channels = dims(image, w, h);
    const hair = coverage(mask, w, h);
    const region = colourRegion(w, h, anchors, p.region, p.feather);
    const chosen = swatch(p.swatch_id);
    const reference = sampleReference(image, mask, w, h, chosen.rgb);
    const delta = chosen.rgb.map((c, k) => c - reference.colour[k]);
    const result = new Uint8Array(image);
    let changed = 0, support = 0;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (hair[i] > 0)
                support++;
            const idx = i * channels;
            const luminance = (image[idx] * .2126 + image[idx + 1] * .7152 + image[idx + 2] * .0722) / 255;
            const specular = smooth(.63, .99, luminance) * p.preserve_highlights / 100;
            const weight = Math.max(0, Math.min(1, hair[i] * region[i] * p.strength / 100 * (1 - specular)));
            const micro = ((x * 17 + y * 29 + p.seed * 3) % 37) / 36;
            const subtle = .91 + micro * .09;
            let altered = false;
            for (let c = 0; c < 3; c++) {
                const value = Math.max(0, Math.min(255, image[idx + c] + weight * delta[c] * subtle));
                result[idx + c] = Math.floor(value + .5);
                if (result[idx + c] !== image[idx + c])
                    altered = true;
            }
            if (altered)
                changed++;
        }
    return { before: new Uint8Array(image), after: result,
        notice: 'Local screen-only hair-colour simulation. No physical dye match is implied.',
        metrics: { candidate_swatch: chosen.id, sampled_reference: reference.colour,
            sample_count: reference.count, undertone_delta_e76: colourDeltaE76(reference.colour, chosen.rgb),
            edited_pixels: changed, mask_support_pixels: support, provider_calls: 0, simulated: true },
    };
}
export function renderPaletteFibres(image, width, height, hair, scalp, density, anchors, input) {
    const chosen = swatch(input.swatch_id);
    return renderFibres(image, width, height, hair, scalp, density, anchors, {
        hair_rgb: chosen.rgb, region: input.region ?? 'both', strength: input.strength ?? 65,
        density_gain: input.density_gain ?? 80, seed: input.seed ?? 37,
    });
}
