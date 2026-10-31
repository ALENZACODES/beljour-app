/** Reproducible six-condition study of W6 reference identity on drawn patches.
 * Mirrors api/plumb_api/engines/shade/reference_study.py: the same layout, colours,
 * casts and conditions, read by the historical cheek-first reader (baseline) and by
 * the checked entry with the two-cheek consensus (candidate). No photograph, mesh or
 * model; every condition value is an ASSUMED engineering choice. Results are synthetic
 * exact-reference outcomes, not face accuracy or physical product matching.
 * Author: John Khan.
 */
import { decode, encode, labToSrgb, RGB_TO_XYZ, toByte } from "./colourspace.js";
import { loadReferenceShades, shadeById } from "./loaders.js";
import { assessSkinZones } from "./skin-accuracy.js";
import { summarizeAccuracy } from "./skin-evidence.js";
export const CONDITIONS = [
    "flat_patches",
    "forehead_glare_cheeks_agree",
    "cheeks_disagree",
    "insufficient_cheek_samples",
    "warm_light_checked_neutral",
    "cool_light_checked_neutral",
];
export const EVIDENCE_IDS = {
    flat_patches: "r32f-flat-patches",
    forehead_glare_cheeks_agree: "r32f-forehead-glare-cheeks-agree",
    cheeks_disagree: "r32f-cheeks-disagree",
    insufficient_cheek_samples: "r32f-insufficient-cheek-samples",
    warm_light_checked_neutral: "r32f-warm-light-checked-neutral",
    cool_light_checked_neutral: "r32f-cool-light-checked-neutral",
};
export const AGGREGATE_ID = "r32f-six-condition-aggregate";
export const BLOCK = 24;
export const GAP = 2;
export const HEIGHT = BLOCK + 2 * GAP;
export const WIDTH = 4 * (BLOCK + GAP) + GAP;
const BLOCKS = ["cheek_right", "cheek_left", "forehead", "neutral"];
const SPARSE_CHEEK = [2, 3];
const FILL = 96;
const NEUTRAL_GREY = 128;
const GLARE_LIGHTNESS = 12;
const GLARE_CHROMA = 0.7;
const CHEEK_SHIFT = 20;
function unitLuminance(cast) {
    const y = RGB_TO_XYZ[1][0] * cast[0] + RGB_TO_XYZ[1][1] * cast[1] + RGB_TO_XYZ[1][2] * cast[2];
    return [cast[0] / y, cast[1] / y, cast[2] / y];
}
export const CASTS = {
    warm_light_checked_neutral: unitLuminance([1.15, 1.0, 0.8]),
    cool_light_checked_neutral: unitLuminance([0.86, 1.0, 1.22]),
};
function bytes(lab) {
    const rgb = labToSrgb(lab);
    return [toByte(rgb[0]), toByte(rgb[1]), toByte(rgb[2])];
}
/** The drawn RGB scene, its zone masks and the neutral-card mask (or null). */
export function drawScenario(lab, condition) {
    if (!CONDITIONS.includes(condition))
        throw new RangeError("unknown reference study condition");
    const data = new Uint8Array(WIDTH * HEIGHT * 3).fill(FILL);
    const colours = { cheek_right: lab, cheek_left: lab, forehead: lab };
    if (condition === "forehead_glare_cheeks_agree") {
        colours.forehead = [Math.min(100, lab[0] + GLARE_LIGHTNESS), lab[1] * GLARE_CHROMA, lab[2] * GLARE_CHROMA];
    }
    else if (condition === "cheeks_disagree") {
        colours.cheek_left = [lab[0] + (lab[0] > 50 ? -CHEEK_SHIFT : CHEEK_SHIFT), lab[1], lab[2]];
    }
    const paint = (name, rgb, mask, sparse) => {
        const left = GAP + BLOCKS.indexOf(name) * (BLOCK + GAP);
        for (let y = GAP; y < GAP + BLOCK; y++)
            for (let x = left; x < left + BLOCK; x++) {
                const i = y * WIDTH + x;
                data.set(rgb, i * 3);
                if (mask && (!sparse || (y < GAP + SPARSE_CHEEK[0] && x < left + SPARSE_CHEEK[1])))
                    mask[i] = 1;
            }
    };
    const masks = {};
    for (const name of ["cheek_right", "cheek_left", "forehead"]) {
        masks[name] = new Uint8Array(WIDTH * HEIGHT);
        paint(name, bytes(colours[name]), masks[name], condition === "insufficient_cheek_samples" && name !== "forehead");
    }
    let neutral = null;
    const cast = CASTS[condition];
    if (cast) {
        neutral = new Uint8Array(WIDTH * HEIGHT);
        paint("neutral", [NEUTRAL_GREY, NEUTRAL_GREY, NEUTRAL_GREY], neutral, false);
        for (let i = 0; i < data.length; i++)
            data[i] = toByte(encode(decode(data[i]) * cast[i % 3]));
    }
    return { image: { width: WIDTH, height: HEIGHT, channels: 3, data }, masks, neutral };
}
/** Draw one reference under one condition and read it with both readers. */
export function evaluateReferenceScenario(shade, condition) {
    const record = typeof shade === "string" ? shadeById(shade, "reference") : shade;
    if (record.surface !== "skin")
        throw new RangeError("the reference study reads skin references only");
    const { image, masks, neutral } = drawScenario(record.lab, condition);
    const found = assessSkinZones(image, masks, neutral ? { neutralMask: neutral } : {});
    const baselineId = found.baseline.refused ? null : found.baseline.best?.id ?? null;
    const candidateId = found.referenceId;
    return { shade_id: record.id, condition, baseline_id: baselineId, candidate_id: candidateId,
        candidate_source: found.source, baseline_exact: baselineId === record.id,
        candidate_exact: candidateId === record.id, refused: candidateId === null,
        wrong_accepted: candidateId !== null && candidateId !== record.id };
}
function summaries(outcomes) {
    return [
        summarizeAccuracy(outcomes.map((o) => ({ expected_id: o.shade_id, predicted_id: o.baseline_id }))),
        summarizeAccuracy(outcomes.map((o) => ({ expected_id: o.shade_id, predicted_id: o.candidate_id }))),
    ];
}
function row(id, condition, outcomes) {
    const [baseline, candidate] = summaries(outcomes);
    return { id, condition, n: candidate.total, baseline_exact: baseline.exact, candidate_exact: candidate.exact,
        refused: candidate.refused, wrong_accepted: candidate.wrong_accepted, kind: "synthetic" };
}
/** Every reference under every requested condition, in catalogue then condition order. */
export function runReferenceStudy(conditions = CONDITIONS, shades = loadReferenceShades()) {
    if (!conditions.length || new Set(conditions).size !== conditions.length ||
        conditions.some((c) => !CONDITIONS.includes(c))) {
        throw new RangeError("conditions must be distinct known study conditions");
    }
    const outcomes = shades.flatMap((record) => conditions.map((c) => evaluateReferenceScenario(record, c)));
    const rows = conditions.map((c) => row(EVIDENCE_IDS[c], c, outcomes.filter((o) => o.condition === c)));
    if (conditions.length > 1)
        rows.push(row(AGGREGATE_ID, "aggregate", outcomes));
    return { format: "beljour-reference-study/1", outcomes, rows,
        references: new Set(outcomes.map((o) => o.shade_id)).size,
        note: "Synthetic exact-reference outcome on drawn patches; not face accuracy.",
        real_face_pass: false, tested_against_real_products: false };
}
