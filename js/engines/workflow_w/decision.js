/** One local hair colour or makeup decision: the exact shade, where it goes, what it costs and
 * how long it lasts. Mirrors api/plumb_api/engines/workflow_w/decision.py; shared vectors in
 * api/tests/goldens/decision-layer.json. Prices are ASSUMED Canadian-dollar ranges from
 * estimates.json, every one editable by her; a shade is a colour target for her professional
 * to formulate from, never a mixing recipe or product match. No photo, mask or landmark is
 * kept. Author: John Khan.
 */
import { checkedLab, suggest } from "../hair_palette/palette.js";
import { LEVELS } from "../haircolour/generated/levels.js";
import { levelLab, levelOfLightness, levelRow, sessionPlan } from "../haircolour/balayage.js";
import { depthBand, matchShades, undertoneOf } from "../shade/finder.js";
import { ESTIMATES } from "./generated/estimates.js";
import { priceEstimate } from "./index.js";
export const VERSION = "decision-layer/1";
export const SCALE_NOTE = "Levels use the lift scale of the session planner; swatch names keep their own depth numbers.";
export const SPEC_NOTE = "A colour target for your professional to formulate from. Not a mixing recipe, developer strength or product match.";
export const FOUNDATION_NOTE = "Our own reference shades, never lighter than measured. Not tested against real products; swatch on the jaw in daylight.";
export const PLACEMENT_NOTE = "Share of your marked hair that is painted, by height. Printed as black and white hatching.";
export const MODES = ["all_over", "balayage"];
export const ZONES = ["roots", "mid_lengths", "ends"];
const ZONE_WORDS = { roots: "roots", mid_lengths: "mid-lengths", ends: "ends" };
export const UNITS = { weeks: 104, hours: 48 };
export const MAX_PRICE = 10000; // ASSUMED sanity bound, as decision.py
export const MAX_SESSIONS = 12;
export const PAINT_THRESHOLD = 0.15; // the printed hatch cut
export const MIN_HAIR_PIXELS = 16;
const HISTORIES = ["virgin", "colour_treated", "box_dye"];
export const REFUSALS = {
    unknown_service: "That service is not in the estimate table.",
    invalid_figures: "Prices and durations need a low and a high value, low first.",
    no_hair_mask: "Mark your hair first, so the placement can be measured.",
    no_shade: "No reference shade sits at or below your measured depth, so none is suggested.",
};
/** A coded refusal: the input cannot give an honest answer, so none is made up. */
export class DecisionError extends RangeError {
    code;
    constructor(code, detail = "") {
        super(REFUSALS[code] + (detail ? ` (${detail})` : ""));
        this.code = code;
        this.name = "DecisionError";
    }
}
function pair(value, low, high, where, whole = false) {
    if (!Array.isArray(value) || value.length !== 2 || value.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
        throw new DecisionError("invalid_figures", where);
    }
    const [a, b] = value;
    if (!(low <= a && a <= b && b <= high) || (whole && (!Number.isInteger(a) || !Number.isInteger(b)))) {
        throw new DecisionError("invalid_figures", where);
    }
    return [a, b];
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
export function services() { return ESTIMATES.services; }
export function service(id) {
    const row = services().find((s) => s.id === id);
    if (!row)
        throw new DecisionError("unknown_service", String(id));
    return row;
}
/** Ranges for one service. Her own figures replace the ASSUMED ones field by field. */
export function costAndLongevity(serviceId, options = {}) {
    const row = service(serviceId), { sessions = 1 } = options;
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > MAX_SESSIONS)
        throw new DecisionError("invalid_figures", "sessions");
    const per = pair(options.price ?? row.price, 0, MAX_PRICE, "price");
    const span = pair(options.lasts ?? row.lasts, 1, UNITS[row.unit], "lasts", true);
    const edited = [];
    if (options.price && !same(options.price, row.price))
        edited.push("price");
    if (options.lasts && !same(options.lasts, row.lasts))
        edited.push("lasts");
    const first = priceEstimate(per[0], per[1], sessions, span[1]);
    const out = { service: row.id, label: row.label, kind: row.kind, currency: "CAD", sessions, per_session: per,
        first_visit: [first.initial_low, first.initial_high], lasts: span, unit: row.unit, lasts_note: row.lasts_note,
        upkeep: null, year_one: null, edited, source: "", label_note: ESTIMATES.label };
    if (row.upkeep !== null && row.unit === "weeks") {
        const upRow = service(row.upkeep);
        const up = pair(options.upkeepPrice ?? upRow.price, 0, MAX_PRICE, "upkeep price");
        if (options.upkeepPrice && !same(options.upkeepPrice, upRow.price))
            edited.push("upkeep_price");
        // Fewest visits: the longest a result lasts; most visits: the shortest (W94 visit rule).
        const fewest = priceEstimate(up[0], up[1], 1, span[1]).maintenance_visits_estimate;
        const most = priceEstimate(up[0], up[1], 1, span[0]).maintenance_visits_estimate;
        out.upkeep = { service: upRow.id, label: upRow.label, per_visit: up, visits_per_year: [fewest, most] };
        out.year_one = [first.initial_low + up[0] * fewest, first.initial_high + up[1] * most];
    }
    out.source = edited.length ? "your figures" : "ASSUMED estimate table";
    return out;
}
/** The exact hair colour target: swatch, level, undertone, distance and sessions. */
export function hairSpec(targetLab, options = {}) {
    const { mode = "all_over", baseLevel = null, history = "colour_treated", toner = "none" } = options;
    if (!MODES.includes(mode) || !HISTORIES.includes(history))
        throw new RangeError("unknown hair decision mode or colour history");
    if (baseLevel !== null)
        levelRow(baseLevel);
    let lab;
    if (mode === "balayage") {
        if (options.targetLevel === undefined)
            throw new RangeError("balayage needs a target level");
        lab = levelLab(options.targetLevel, toner);
    }
    else {
        if (!targetLab)
            throw new RangeError("all-over colour needs a target colour");
        lab = [...checkedLab(targetLab)];
    }
    const nearest = suggest(lab, { allowLightening: true, count: 3 });
    // Same lift scale as her measured base (levels.json); palette depth numbers can differ by 2.
    const level = mode === "balayage" ? options.targetLevel : levelOfLightness(lab[0]);
    let sessions = 1, steps = [level], note;
    if (baseLevel !== null && level > baseLevel) {
        const plan = sessionPlan(baseLevel, level, history);
        sessions = plan.sessions;
        steps = [...plan.levels_by_session];
        note = plan.note;
    }
    else if (baseLevel !== null)
        note = "Same depth or darker than your base: one session (ASSUMED).";
    else
        note = "Starting level unknown: mark your hair to measure it. One session is ASSUMED.";
    return { subject: "hair", mode, target_lab: lab, target_level: level, level_name: levelRow(level).name,
        undertone: nearest[0].shade.undertone, toner: mode === "balayage" ? toner : null, base_level: baseLevel, history,
        nearest: nearest.map((s) => ({ id: s.shade.id, name: s.shade.name, family: s.shade.family, level: s.shade.level,
            undertone: s.shade.undertone, delta_e00: s.delta_e00 })),
        sessions, levels_by_session: steps, plan_note: note, service: mode === "balayage" ? "balayage" : "all_over_colour",
        note: SPEC_NOTE, level_scale_note: LEVELS.status };
}
/** Foundation target from a measured skin colour: our reference shades, never lighter. */
export function makeupSpec(skinLab) {
    const lab = [...checkedLab(skinLab)];
    const matches = matchShades(lab).slice(0, 3);
    if (!matches.length)
        throw new DecisionError("no_shade");
    return { subject: "makeup", product: "foundation", measured_lab: lab, depth_band: depthBand(lab[0]),
        undertone: undertoneOf(lab).undertone,
        nearest: matches.map((m) => ({ id: m.id, name: m.name, undertone: m.undertone ?? null, depth: m.depth, delta_e00: m.delta_e })),
        service: "foundation_bottle", note: FOUNDATION_NOTE };
}
/** Painted share of the marked hair overall and by thirds of its height. */
export function placement(hairMask, width, height, paint = null) {
    if (hairMask.length !== width * height)
        throw new RangeError("hair mask must match the photo size");
    if (paint && paint.length !== hairMask.length)
        throw new RangeError("paint map must match the hair mask");
    let top = -1, bottom = -1, count = 0;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            if (hairMask[y * width + x] >= 0.5) {
                if (top < 0)
                    top = y;
                bottom = y;
                count++;
            }
        }
    if (count < MIN_HAIR_PIXELS)
        throw new DecisionError("no_hair_mask");
    const span = bottom - top + 1, totals = [0, 0, 0], placed = [0, 0, 0];
    for (let y = top; y <= bottom; y++) {
        const third = Math.min(2, Math.floor((y - top) * 3 / span));
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (hairMask[i] < 0.5)
                continue;
            totals[third]++;
            if (!paint || paint[i] > PAINT_THRESHOLD)
                placed[third]++;
        }
    }
    const zones = {};
    ZONES.forEach((name, i) => { zones[name] = totals[i] ? placed[i] / totals[i] : 0; });
    return { kind: paint ? "painted" : "all_over", coverage: (placed[0] + placed[1] + placed[2]) / count, zones, note: PLACEMENT_NOTE };
}
/** Whole Canadian dollars, half up, with thousands separators (same text as decision.py). */
export function money(value) {
    return `$${Math.floor(value + 0.5).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
export function percent(share) { return Math.floor(share * 100 + 0.5); }
export function oneDecimal(value) { return (Math.floor(value * 10 + 0.5) / 10).toFixed(1); }
function range(p) {
    const low = money(p[0]), high = money(p[1]);
    return low === high ? low : `${low} to ${high}`;
}
const count = (p) => p[0] === p[1] ? `${p[0]}` : `${p[0]} to ${p[1]}`;
/** Printable wording of a cost and longevity estimate; every line says it is an estimate. */
export function costLines(cost) {
    const source = cost.edited.length ? "your figures" : "ASSUMED estimate", n = cost.sessions, s = n > 1 ? "s" : "";
    const lines = [`${cost.label}: ${range(cost.per_session)} CAD per session (${source}).`,
        `First visit${s}: ${n} session${s}, ${range(cost.first_visit)} CAD.`,
        `Lasts about ${count(cost.lasts)} ${cost.unit} ${cost.lasts_note} (estimate).`];
    if (cost.upkeep) {
        lines.push(`Upkeep: ${cost.upkeep.label.toLowerCase()}, ${range(cost.upkeep.per_visit)} CAD, about ${count(cost.upkeep.visits_per_year)} times a year.`);
        lines.push(`Year one including the first visit: ${range(cost.year_one)} CAD (estimate).`);
    }
    return [...lines, cost.label_note];
}
/** Printable wording of the shade target. */
export function specLines(spec) {
    if (spec.subject === "makeup") {
        return [`Foundation: measured depth band ${spec.depth_band} of 10, ${spec.undertone} undertone.`,
            ...spec.nearest.map((s) => `Reference shade ${s.id} (${s.name}), colour difference ${oneDecimal(s.delta_e00)}`), spec.note];
    }
    const first = spec.nearest[0];
    const lines = [`Hair target: level ${spec.target_level} of 10 (${spec.level_name}), ${spec.undertone} undertone`
            + (spec.toner !== null && spec.toner !== "none" ? `, ${spec.toner} toner` : "") + ".",
        `Nearest in-house swatch ${first.id} (${first.name}), colour difference ${oneDecimal(first.delta_e00)}.`];
    if (first.level !== spec.target_level)
        lines.push(SCALE_NOTE);
    if (spec.base_level !== null)
        lines.push(`Starting level ${spec.base_level} of 10 (photo estimate), history: ${spec.history.replaceAll("_", " ")}.`);
    lines.push(`Sessions: ${spec.sessions} (levels ${spec.levels_by_session.join(" -> ")}). ${spec.plan_note}`);
    return [...lines, spec.note];
}
export function placementLines(place) {
    if (place.kind === "all_over")
        return ["Placement: all of your marked hair, roots to ends."];
    return [`Placement: ${percent(place.coverage)}% of your marked hair is painted.`,
        `By height: ${ZONES.map((z) => `${ZONE_WORDS[z]} ${percent(place.zones[z])}%`).join(", ")}.`, place.note];
}
//# sourceMappingURL=decision.js.map