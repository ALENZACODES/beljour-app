/** Two-cheek consensus for W6 skin readings, behind the checked cheek-first photo entry.
 * Mirrors api/plumb_api/engines/shade/skin_accuracy.py and, for backgroundFromFace,
 * the grey-world background estimate of measurement.py. The forehead is left out only
 * when both cheeks keep enough original pixels, agree within the committed
 * zone-consistency bound, and the forehead disagrees with both of them. The recovered
 * reading still goes through the unchanged findFromPixels limits (0.45 confidence,
 * 6.0 delta-E, 1.0 L* no-lightening). A reading the historical path accepts is never
 * replaced. Public summaries carry reference labels and bounded measurements only,
 * never pixels, masks or landmarks. In-house references, not physical products.
 * Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { CONTOURS } from "../../data/regions/index.js";
import { DEEP_REFERENCE } from "./deep-reference.js";
import { findFromPixels, pixelsToLab, trimmedStats, whiteBalance, zoneMasks, } from "./finder.js";
import { SHADE_DATA } from "./generated/data.js";
import { auditPatches } from "./reading.js";
export const CHEEKS = ["cheek_right", "cheek_left"];
const T = SHADE_DATA.thresholds;
const NOTES = {
    none: "Both cheeks agree; the forehead was used only when it agreed with them.",
    insufficient_cheek_samples: "Not enough visible pixels on both cheeks; no shade is suggested.",
    cheeks_disagree: "The two cheeks read differently; no shade is suggested.",
    reading_refused: "The cheek reading did not pass the existing shade limits.",
};
const round4 = (v) => Math.round(v * 1e4) / 1e4;
const defaultTable = () => [...SHADE_DATA.shades, ...DEEP_REFERENCE];
function median(pixels, white) {
    return trimmedStats(pixelsToLab([...pixels], white)).median;
}
function decision(reason, zoneSizes, extra = {}) {
    return { usable: reason === null, reason, cheekDistance: null, foreheadDistances: null,
        foreheadExcluded: false, zonesUsed: [], zoneSizes, reading: null, note: NOTES[reason ?? "none"], ...extra };
}
/** Read W6 from the cheeks, leaving out a forehead that disagrees with both of them. */
export function recoverConsensus(zoneRgb, white, table = defaultTable()) {
    const minimum = T.minimum_zone_pixels;
    const bound = T.confidence.zone_delta_e_ok;
    const pixels = { cheek_right: zoneRgb.cheek_right ?? [], cheek_left: zoneRgb.cheek_left ?? [],
        forehead: zoneRgb.forehead ?? [] };
    const sizes = { cheek_right: pixels.cheek_right.length, cheek_left: pixels.cheek_left.length,
        forehead: pixels.forehead.length };
    if (Math.min(sizes.cheek_right, sizes.cheek_left) < minimum)
        return decision("insufficient_cheek_samples", sizes);
    const right = median(pixels.cheek_right, white), left = median(pixels.cheek_left, white);
    const cheekDistance = ciede2000(right, left);
    if (cheekDistance > bound)
        return decision("cheeks_disagree", sizes, { cheekDistance });
    let zonesUsed = [...CHEEKS];
    let foreheadDistances = null;
    let foreheadExcluded = false;
    if (sizes.forehead >= minimum) {
        const top = median(pixels.forehead, white);
        foreheadDistances = [ciede2000(top, right), ciede2000(top, left)];
        foreheadExcluded = Math.min(...foreheadDistances) > bound;
        if (!foreheadExcluded)
            zonesUsed = [...CHEEKS, "forehead"];
    }
    const used = {};
    for (const name of zonesUsed)
        used[name] = pixels[name];
    const reading = findFromPixels(used, white, table);
    return decision(reading.refused ? "reading_refused" : null, sizes, { cheekDistance, foreheadDistances, foreheadExcluded, zonesUsed, reading });
}
export function publicConsensus(found) {
    return {
        usable: found.usable, reason: found.reason,
        cheek_distance: found.cheekDistance === null ? null : round4(found.cheekDistance),
        forehead_distances: found.foreheadDistances === null ? null : found.foreheadDistances.map(round4),
        forehead_excluded: found.foreheadExcluded, zones_used: [...found.zonesUsed],
        zone_sizes: { ...found.zoneSizes }, reference_id: found.reading?.best?.id ?? null, note: found.note,
    };
}
export function publicSkinAssessment(found) {
    return {
        format: "beljour-skin-accuracy/1", accepted: found.accepted, source: found.source,
        reference_id: found.referenceId, reading: found.reading, baseline_refused: found.baseline.refused,
        lighting_audit: { ...found.audit, cheek_distance: found.audit.cheek_distance === null ? null
                : round4(found.audit.cheek_distance) },
        consensus: found.consensus === null ? null : publicConsensus(found.consensus),
        background: found.background, provider_calls: 0, tested_against_real_products: false,
    };
}
function audited(found, audit) {
    if (audit.usable)
        return found;
    return { ...found, refused: true, reason: audit.note, best: null, alternative: null, test_plan: null,
        confidence: { ...found.confidence, overall: 0 }, notes: [...found.notes, `Lighting audit: ${audit.reason}.`] };
}
function checkPhoto(image) {
    if ((image.channels !== 3 && image.channels !== 4) ||
        image.data.length !== image.width * image.height * image.channels) {
        throw new RangeError("skin accuracy needs an RGB or RGBA photo");
    }
}
/** Cheek-first W6 on supplied zone masks, then the consensus path only on refusal. */
export function assessSkinZones(image, masks, options = {}) {
    checkPhoto(image);
    const background = options.background ?? (options.neutralMask ? "explicit_neutral"
        : options.backgroundMask ? "explicit_background" : "none");
    const white = whiteBalance(image, options);
    const C = T.confidence;
    const { samples, audit } = auditPatches(image, masks, white.gains, white.mode, T.minimum_zone_pixels, C.zone_delta_e_ok + C.zone_delta_e_span);
    const table = options.table ?? defaultTable();
    const baseline = audited(findFromPixels(samples, white, table), audit);
    if (!baseline.refused) {
        return { accepted: true, source: "baseline", referenceId: baseline.best?.id ?? null, reading: baseline,
            baseline, audit, consensus: null, background };
    }
    const consensus = recoverConsensus(samples, white, table);
    if (consensus.usable && consensus.reading !== null) {
        return { accepted: true, source: "cheek_consensus", referenceId: consensus.reading.best?.id ?? null,
            reading: consensus.reading, baseline, audit, consensus, background };
    }
    return { accepted: false, source: "refused", referenceId: null, reading: baseline, baseline, audit,
        consensus, background };
}
function channelMedian(values) {
    const s = values.sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** Grey-world candidates outside the face, scalp and hair band; mirrors measurement.background_from_face. */
export function backgroundFromFace(image, points) {
    checkPhoto(image);
    const { width, height, channels, data } = image;
    if (Math.min(width, height) < 16 || width * height > 24_000_000) {
        throw new RangeError("Shade measurement dimensions are unsupported");
    }
    if (points.length < 478)
        throw new RangeError("Shade measurement requires a finite 478-point mesh");
    const xy = points.map((p) => Array.isArray(p) ? [Number(p[0]), Number(p[1])]
        : [Number(p.x), Number(p.y)]);
    if (!xy.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) {
        throw new RangeError("Shade measurement requires a finite 478-point mesh");
    }
    if (xy.some(([x, y]) => x < 0 || x > width || y < 0 || y > height)) {
        throw new RangeError("Shade mesh must use image pixel coordinates");
    }
    const outline = CONTOURS.face_oval.map((i) => xy[i]);
    const x0 = Math.min(...outline.map((p) => p[0])), x1 = Math.max(...outline.map((p) => p[0]));
    const y0 = Math.min(...outline.map((p) => p[1])), y1 = Math.max(...outline.map((p) => p[1]));
    const faceW = x1 - x0, faceH = y1 - y0;
    if (faceW < 12 || faceH < 16)
        return { mask: null, candidatePixels: 0, usablePixels: 0, reason: "face_too_small", estimated: false };
    const xlow = Math.max(0, Math.floor(x0 - 0.25 * faceW)), xhigh = Math.min(width, Math.ceil(x1 + 0.25 * faceW));
    const ylow = Math.max(0, Math.floor(y0 - 0.65 * faceH)), yhigh = Math.min(height, Math.ceil(y1 + 0.15 * faceH));
    const mask = new Uint8Array(width * height);
    const channel = [[], [], []];
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            if (y >= ylow && y < yhigh && x >= xlow && x < xhigh)
                continue;
            const i = y * width + x, o = i * channels;
            if (channels === 4 && !(data[o + 3] > 245))
                continue;
            if (![0, 1, 2].every((c) => data[o + c] >= 8 && data[o + c] <= 247))
                continue;
            mask[i] = 1;
            for (let c = 0; c < 3; c++)
                channel[c].push(data[o + c]);
        }
    const candidatePixels = channel[0].length;
    const minimum = Math.max(64, Math.trunc(0.045 * height * width));
    if (candidatePixels < minimum) {
        return { mask: null, candidatePixels, usablePixels: 0, reason: "background_not_visible", estimated: false };
    }
    const centre = channel.map((values) => channelMedian([...values]));
    let usablePixels = 0;
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i])
            continue;
        const o = i * channels;
        const error = Math.max(...[0, 1, 2].map((c) => Math.abs(data[o + c] - centre[c])));
        if (error <= 20)
            usablePixels++;
        else
            mask[i] = 0;
    }
    if (usablePixels < minimum || usablePixels / candidatePixels < 0.72) {
        return { mask: null, candidatePixels, usablePixels, reason: "background_mixed", estimated: false };
    }
    return { mask, candidatePixels, usablePixels, reason: "grey_world_estimate", estimated: true };
}
/** W6 on one photo with its 478 landmarks in pixel coordinates. */
export function assessSkinPhoto(image, points, options = {}) {
    checkPhoto(image);
    const masks = zoneMasks(points, image.width, image.height);
    if (options.neutralMask === undefined && options.backgroundMask === undefined) {
        const estimate = backgroundFromFace(image, points);
        return assessSkinZones(image, masks, { ...options, backgroundMask: estimate.mask ?? undefined,
            background: estimate.reason });
    }
    return assessSkinZones(image, masks, options);
}
