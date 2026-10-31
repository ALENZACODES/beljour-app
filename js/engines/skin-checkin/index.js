/** "Is it working?": compare two YouCam skin analyses honestly, and follow a series of them.
 * Mirrors api/plumb_api/engines/skin_checkin/__init__.py; shared vectors in
 * api/tests/goldens/skin_checkin.json, constants in generated/checkin.ts (from checkin.json).
 * Scores are the measured YouCam raw_score (0 to 100, higher means healthier looking), never
 * the display ui_score. Each noise band and minimum gap is ASSUMED (see checkin.json). The field
 * names of compare() are the checkin block of the Skin Moment wire contract
 * (web/src/screens/skin-moment-types.ts). Cosmetic tracking only, not medical advice.
 * Author: John Khan.
 */
import { CHECKIN } from "./generated/checkin.js";
export const FORMAT = CHECKIN.format;
export const VERSION = CHECKIN.version;
export const NOTE = CHECKIN.note;
export const MIN_POINTS = CHECKIN.history.min_points;
export const CONCERNS = CHECKIN.concerns;
const SPECS = new Map(CONCERNS.map((c) => [c.concern, c]));
const CONDITIONS = CHECKIN.conditions;
const SCALE = CHECKIN.scale;
export const WORDS = {
    improving: "improving", steady: "no real change", worsening: "worsening",
    too_soon: "too soon to tell", not_enough: "needs more check-ins",
};
/** Input the check-in will not judge; `code` and the message match the Python engine. */
export class CheckinRefusal extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "CheckinRefusal";
    }
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function scores(raw, where) {
    if (!isObject(raw))
        throw new CheckinRefusal("scores_not_object", `${where} scores must be an object of concern: raw_score`);
    const out = new Map();
    for (const [name, value] of Object.entries(raw)) {
        if (!isNumber(value))
            throw new CheckinRefusal("score_not_number", `${where} ${name}: raw_score must be a finite number`);
        if (!(SCALE.min <= value && value <= SCALE.max))
            throw new CheckinRefusal("score_out_of_range", `${where} ${name}: raw_score must be 0 to 100`);
        out.set(name, value);
    }
    return out;
}
/** A {concern: raw_score} map checked by the same rules and messages as Python's _scores. */
export function checkScores(raw, where) {
    return Object.fromEntries(scores(raw, where));
}
/** {concern: raw_score} from a stored snapshot's [{concern, raw_score}] list (wire contract). */
export function scoresFromConcerns(concerns) {
    if (!Array.isArray(concerns))
        throw new CheckinRefusal("concerns_not_list", "snapshot concerns must be a list");
    const out = Object.create(null);
    for (const item of concerns) {
        if (!isObject(item) || typeof item.concern !== "string") {
            throw new CheckinRefusal("concern_invalid", "each snapshot concern needs a concern name and raw_score");
        }
        if (Object.prototype.hasOwnProperty.call(out, item.concern)) {
            throw new CheckinRefusal("concern_repeated", `${item.concern} appears twice in one snapshot`);
        }
        out[item.concern] = item.raw_score ?? null;
    }
    return Object.fromEntries(scores(out, "snapshot"));
}
function wholeDays(value, where = "days") {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new CheckinRefusal("days_invalid", `${where} must be a whole number of days, 0 or more`);
    }
    return value;
}
function condition(photo, key) {
    if (photo === null || photo === undefined)
        return null;
    if (!isObject(photo))
        throw new CheckinRefusal("conditions_not_object", "photo conditions must be an object");
    const value = photo[key];
    if (value === null || value === undefined)
        return null;
    if (!isNumber(value))
        throw new CheckinRefusal("condition_not_number", `photo condition ${key} must be a finite number`);
    return value;
}
/** [factor, lighting differs, pose differs] from optional per-photo checks; 1 when unknown. */
export function bandFactor(previousPhoto, currentPhoto) {
    const a = condition(previousPhoto, "brightness"), b = condition(currentPhoto, "brightness");
    const lighting = a !== null && b !== null && Math.abs(a - b) > CONDITIONS.brightness_step;
    let pose = false;
    for (const key of ["yaw", "pitch"]) {
        const p = condition(previousPhoto, key), q = condition(currentPhoto, key);
        pose = pose || (p !== null && q !== null && Math.abs(p - q) > CONDITIONS.angle_step);
    }
    let factor = 1.0;
    if (lighting)
        factor *= CONDITIONS.lighting_factor;
    if (pose)
        factor *= CONDITIONS.pose_factor;
    return [factor, lighting, pose];
}
function labelsWith(rows, verdict) {
    return rows.filter((r) => r.verdict === verdict).map((r) => r.label);
}
function count(n) { return n === 1 ? `${n} concern` : `${n} concerns`; }
function summary(rows, days, widened) {
    if (!rows.length)
        return "Nothing to compare: these two check-ins share no measured concerns.";
    const soon = rows.filter((r) => r.too_soon).map((r) => r.label);
    const better = labelsWith(rows, "better"), worse = labelsWith(rows, "worse");
    const same = rows.filter((r) => r.verdict === "no_real_change" && !r.too_soon).length;
    const parts = [];
    if (soon.length === rows.length) {
        const wait = Math.min(...rows.map((r) => r.min_days)) - days;
        parts.push(`Too soon to tell: ${days} days since the last check-in. Skin renews over about four weeks, `
            + `so check again in ${wait} more ${wait === 1 ? "day" : "days"}.`);
        if (worse.length)
            parts.push(`Already lower than normal variation: ${worse.join(", ")}.`);
    }
    else {
        if (!better.length && !worse.length) {
            parts.push("No real change yet: every difference is within normal photo-to-photo variation.");
        }
        else {
            if (better.length)
                parts.push(`Better: ${better.join(", ")}.`);
            if (worse.length)
                parts.push(`Worse: ${worse.join(", ")}.`);
            if (same)
                parts.push(`No real change on ${count(same)}.`);
        }
        if (soon.length)
            parts.push(`Too soon to tell for ${soon.join(", ")}.`);
    }
    if (widened)
        parts.push("Lighting or head angle differed between the photos, so only larger changes count.");
    return parts.join(" ");
}
/** Judge each concern measured in both check-ins (same rules as compare() in Python): a change
 * must be beyond the band to count; before a concern's min_days a rise is not credited, while a
 * drop beyond the band is still reported as worse. */
export function compare(previous, current, options) {
    const before = scores(previous, "previous"), after = scores(current, "current");
    const gap = wholeDays(options.days);
    const previousAt = options.previousAt ?? null;
    if (previousAt !== null && typeof previousAt !== "string") {
        throw new CheckinRefusal("previous_at_invalid", "previous_at must be an ISO 8601 string");
    }
    const [factor, lighting, pose] = bandFactor(options.previousPhoto, options.currentPhoto);
    const rows = [];
    for (const spec of CONCERNS) {
        const name = spec.concern;
        const b = before.get(name), a = after.get(name);
        if (b === undefined || a === undefined)
            continue;
        const delta = a - b;
        const gain = spec.higher_is_better ? delta : -delta;
        const band = spec.band * factor;
        const tooSoon = gap < spec.min_days;
        const verdict = gain < -band ? "worse" : gain > band && !tooSoon ? "better" : "no_real_change";
        rows.push({ concern: name, label: spec.label, before: b, after: a, delta, noise_band: band, verdict,
            higher_is_better: spec.higher_is_better, too_soon: tooSoon, min_days: spec.min_days });
    }
    const skipped = new Set();
    for (const name of before.keys())
        if (!after.has(name) || !SPECS.has(name))
            skipped.add(name);
    for (const name of after.keys())
        if (!before.has(name))
            skipped.add(name);
    return { previous_at: previousAt, days_between: gap, changes: rows, summary: summary(rows, gap, lighting || pose),
        too_soon: rows.length > 0 && rows.every((r) => r.too_soon), band_factor: factor, lighting_differs: lighting,
        pose_differs: pose, skipped: [...skipped].sort(byCodePoint), format: FORMAT, version: VERSION, note: NOTE };
}
/** Python's sorted() order: by Unicode code point. Array.prototype.sort() compares UTF-16 code
 * units, which puts a name with a character beyond U+FFFF (an emoji) before one with U+E000-U+FFFF. */
function byCodePoint(a, b) {
    const x = [...a], y = [...b];
    for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
        const d = x[i].codePointAt(0) - y[i].codePointAt(0);
        if (d)
            return d;
    }
    return x.length - y.length;
}
/** Least-squares slope, summed in input order (the same order as the Python copy). */
function fit(xs, ys) {
    const n = xs.length;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i += 1) {
        sx += xs[i];
        sy += ys[i];
    }
    const meanX = sx / n, meanY = sy / n;
    let top = 0, bottom = 0;
    for (let i = 0; i < n; i += 1) {
        top += (xs[i] - meanX) * (ys[i] - meanY);
        bottom += (xs[i] - meanX) * (xs[i] - meanX);
    }
    return top / bottom;
}
function historyOverall(rows, checkIns) {
    if (checkIns < MIN_POINTS)
        return `A trend needs at least ${MIN_POINTS} check-ins; you have ${checkIns}.`;
    const parts = [];
    const up = labelsWith(rows, "improving"), down = labelsWith(rows, "worsening");
    const steady = rows.filter((r) => r.verdict === "steady").length;
    if (up.length)
        parts.push(`Improving over time: ${up.join(", ")}.`);
    if (down.length)
        parts.push(`Worsening over time: ${down.join(", ")}.`);
    if (steady)
        parts.push(`Steady on ${count(steady)}.`);
    const soon = labelsWith(rows, "too_soon");
    if (soon.length)
        parts.push(`Too soon to tell for ${soon.join(", ")}.`);
    const few = labelsWith(rows, "not_enough");
    if (few.length)
        parts.push(`Needs more check-ins for ${few.join(", ")}.`);
    return parts.length ? parts.join(" ") : "Nothing to follow yet.";
}
/** Trend per concern over check-ins, each {day: days since the first, scores}; days must increase.
 * A concern needs MIN_POINTS check-ins; its fitted change over the days it covers is judged
 * against its band, and a span shorter than its min_days is too soon to tell. */
export function history(points) {
    if (!Array.isArray(points))
        throw new CheckinRefusal("points_not_list", "history needs a list of check-ins");
    const series = [];
    points.forEach((point, index) => {
        if (!isObject(point))
            throw new CheckinRefusal("point_not_object", `check-in ${index} must be an object`);
        const day = wholeDays(point.day, `check-in ${index} day`);
        if (series.length && day <= series[series.length - 1][0]) {
            throw new CheckinRefusal("days_not_increasing", "check-in days must increase");
        }
        series.push([day, scores(point.scores, `check-in ${index}`)]);
    });
    const rows = [];
    for (const spec of CONCERNS) {
        const name = spec.concern;
        const xs = [], ys = [];
        for (const [day, s] of series) {
            const value = s.get(name);
            if (value !== undefined) {
                xs.push(day);
                ys.push(value);
            }
        }
        if (!xs.length)
            continue;
        const span = xs[xs.length - 1] - xs[0];
        const row = { concern: name, label: spec.label, points: xs.length, band: spec.band, min_days: spec.min_days,
            first: ys[0], last: ys[ys.length - 1], span_days: span, slope_per_30_days: null, fitted_change: null,
            verdict: "not_enough", words: WORDS.not_enough };
        if (xs.length >= MIN_POINTS) {
            const slope = fit(xs, ys);
            const fitted = slope * span;
            row.slope_per_30_days = slope * 30.0;
            row.fitted_change = fitted;
            row.verdict = span < spec.min_days ? "too_soon" : fitted > spec.band ? "improving"
                : fitted < -spec.band ? "worsening" : "steady";
        }
        row.words = WORDS[row.verdict];
        rows.push(row);
    }
    return { format: FORMAT, version: VERSION, check_ins: series.length, concerns: rows,
        overall: historyOverall(rows, series.length), note: NOTE };
}
