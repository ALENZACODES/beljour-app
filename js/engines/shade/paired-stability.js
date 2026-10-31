/** Two independent W6 captures must agree before a shade is suggested.
 * Mirrors api/plumb_api/engines/shade/paired_stability.py. Each capture is read on its
 * own through assessSkinPhoto. A shade is suggested only when the second photo differs
 * from the first (exact pixel and size comparison; Python compares SHA-256 digests of
 * the same bytes), each reading clears the existing W6 confidence, reference-distance
 * and no-lightening limits, and both name the same in-house reference. The decision
 * carries labels and bounded measurements only. Author: John Khan.
 */
import { ciede2000 } from "../core/colour.js";
import { SHADE_DATA } from "./generated/data.js";
import { assessSkinPhoto } from "./skin-accuracy.js";
const NOTES = {
    none: "Two different photos name the same in-house reference.",
    same_photo: "The second capture is the same photo; take a new photo to compare.",
    first_invalid: "The first capture has no usable face geometry.",
    second_invalid: "The second capture has no usable face geometry.",
    first_refused: "The first photo did not give a reliable reading.",
    second_refused: "The second photo did not give a reliable reading.",
    references_differ: "The two photos name different references; no shade is suggested.",
};
function samePhoto(a, b) {
    if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels ||
        a.data.length !== b.data.length)
        return false;
    for (let i = 0; i < a.data.length; i++)
        if (a.data[i] !== b.data[i])
            return false;
    return true;
}
function read(capture) {
    try {
        const options = {};
        if (capture.neutralMask !== undefined)
            options.neutralMask = capture.neutralMask;
        if (capture.backgroundMask !== undefined)
            options.backgroundMask = capture.backgroundMask;
        return assessSkinPhoto(capture.image, capture.points, options);
    }
    catch (error) {
        if (error instanceof RangeError || error instanceof TypeError)
            return null;
        throw error;
    }
}
/** The existing W6 confidence, reference-distance and no-lightening limits. */
export function clearsLimits(reading) {
    const C = SHADE_DATA.thresholds.confidence;
    const best = reading.best;
    return !reading.refused && best !== null && (reading.confidence.overall ?? 0) >= C.refuse_below &&
        best.delta_e <= C.refuse_delta_e_above && best.lighter_by <= SHADE_DATA.thresholds.never_lighter_allowance;
}
function identity(found) {
    return found !== null && found.accepted && clearsLimits(found.reading) ? found.referenceId : null;
}
function decision(reason, first = null, second = null) {
    const ids = [identity(first), identity(second)];
    const labs = [first?.reading.measured_lab ?? null, second?.reading.measured_lab ?? null];
    const conf = (f) => f === null ? null : f.reading.confidence.overall ?? 0;
    return { suggested: reason === null, reason, referenceId: reason === null ? ids[0] : null,
        firstReferenceId: ids[0], secondReferenceId: ids[1],
        readingDistance: labs[0] === null || labs[1] === null ? null : ciede2000(labs[0], labs[1]),
        confidences: [conf(first), conf(second)], note: NOTES[reason ?? "none"] };
}
/** Suggest a shade only when two different photos independently agree. */
export function compareShadeCaptures(first, second) {
    if (samePhoto(first.image, second.image))
        return decision("same_photo");
    const one = read(first);
    if (one === null)
        return decision("first_invalid");
    const two = read(second);
    if (two === null)
        return decision("second_invalid", one);
    if (identity(one) === null)
        return decision("first_refused", one, two);
    if (identity(two) === null)
        return decision("second_refused", one, two);
    if (identity(one) !== identity(two))
        return decision("references_differ", one, two);
    return decision(null, one, two);
}
const round4 = (v) => Math.round(v * 1e4) / 1e4;
export function publicPair(found) {
    return {
        suggested: found.suggested, reason: found.reason, reference_id: found.referenceId,
        first_reference_id: found.firstReferenceId, second_reference_id: found.secondReferenceId,
        reading_distance: found.readingDistance === null ? null : round4(found.readingDistance),
        confidences: found.confidences.map((c) => c === null ? null : round4(c)), note: found.note,
        tested_against_real_products: false,
    };
}
