/** Planned scalp-cover and pigment-distance contract, browser side.
 * Mirrors api/plumb_api/engines/concealer/parity_contract.py with the production
 * cutForLevel() and crown level() labels: 41 levels 1.0..5.0 times four starting scalp
 * shares (the committed 0.12/0.25/0.45 cut points and 1.0, ASSUMED) is 164 planned-cover
 * vectors, plus CIEDE2000 for the 91 pairs of the 14 original fibre pigments.
 * checkFibreContract() compares the committed parity/fibre-coverage-r35f.json.
 * Planned coverage only, not final protected pixels or a diagnosis. Author: John Khan.
 */
import { ciede2000 } from "../engines/core/colour.js";
import { LEVEL_LIMITS, SHADES, level } from "../engines/local/fibre.js";
import { cutForLevel } from "../engines/local/strands.js";
export const FORMAT = "beljour-fibre-coverage/1";
export const COVER_LEVELS = Object.freeze(Array.from({ length: 41 }, (_, k) => (10 + k) / 10));
export const START_SHARES = Object.freeze([...LEVEL_LIMITS, 1]);
/** Planned visible-scalp share after fibres at one level; the share must lie in 0..1. */
export function plannedCover(fibreLevel, startShare) {
    if (typeof startShare !== "number" || !(startShare >= 0 && startShare <= 1)) {
        throw new RangeError("Starting scalp share must be a number in 0..1");
    }
    const cut = cutForLevel(fibreLevel);
    const planned = startShare * (1 - cut);
    return Object.freeze({ level: fibreLevel, start_share: startShare, cut, planned_share: planned,
        start_label: level(startShare), planned_label: level(planned) });
}
export function coverVectors() {
    return START_SHARES.flatMap((share) => COVER_LEVELS.map((lv) => plannedCover(lv, share)));
}
export function pigmentPairs() {
    const out = [];
    for (let i = 0; i < SHADES.length; i++) {
        for (let j = i + 1; j < SHADES.length; j++) {
            out.push({ first: SHADES[i][0], second: SHADES[j][0], delta_e: ciede2000(SHADES[i][2], SHADES[j][2]) });
        }
    }
    return out;
}
/** Differences between a committed contract and this build; empty means in agreement. */
export function checkFibreContract(stored, tolerance = 1e-9) {
    const problems = [];
    if (stored.format !== FORMAT)
        problems.push("format");
    const cover = coverVectors(), pigments = pigmentPairs();
    if (stored.cover.length !== cover.length)
        problems.push("cover_count");
    if (stored.pigments.length !== pigments.length)
        problems.push("pigment_count");
    cover.forEach((v, i) => {
        const s = stored.cover[i];
        if (s === undefined || s.level !== v.level || s.start_share !== v.start_share ||
            Math.abs(s.cut - v.cut) > tolerance || Math.abs(s.planned_share - v.planned_share) > tolerance ||
            s.start_label !== v.start_label || s.planned_label !== v.planned_label)
            problems.push(`cover:${i}`);
    });
    pigments.forEach((p, i) => {
        const s = stored.pigments[i];
        if (s === undefined || s.first !== p.first || s.second !== p.second || Math.abs(s.delta_e - p.delta_e) > tolerance) {
            problems.push(`pigment:${i}`);
        }
    });
    return problems;
}
//# sourceMappingURL=fibre-parity.js.map