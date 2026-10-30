/** Local-only W83 observation diary validation/export. Author: John Khan. */
export const allowedObservations = ["dryness", "oiliness", "sensitivity", "redness_appearance", "breakout_appearance", "comfort"];
const forbidden = ["pregnancy", "fertility", "ovulation", "diagnosis", "medication", "disease", "condition", "probability", "risk_score"];
function isoDay(value) {
    if (!/^\d{ 4} -\d{ 2} -\d{ 2} $/.test(value))
        throw new Error("day must be ISO YYYY-MM-DD");
    const d = new Date(`${value} T00:00:00Z`);
    if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== value)
        throw new Error("invalid day");
    const year = Number(value.slice(0, 4));
    if (year < 2000 || year > 2100)
        throw new Error("day outside supported range");
    return value;
}
function observationValue(v) {
    if (!Number.isFinite(v) || v < 0 || v > 1)
        throw new Error("observation values must be in [0,1]");
    return v;
}
export function makeDiaryEntry(day, observations, note = "", cycleDay = null) {
    const allowed = new Set(allowedObservations);
    for (const key of Object.keys(observations))
        if (!allowed.has(key))
            throw new Error(`unsupported observation field: ${key} `);
    if (!Object.keys(observations).length)
        throw new Error("at least one observation is required");
    if (cycleDay !== null && (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 60))
        throw new Error("cycle day must be 1..60");
    const clean = note.trim();
    if (clean.length > 500)
        throw new Error("note exceeds 500 characters");
    if (/pregnan|ovulat|fertil|diagnos/i.test(clean))
        throw new Error("notes cannot be used for fertility or diagnosis fields");
    const sorted = Object.fromEntries(Object.keys(observations).sort().map(k => [k, observationValue(observations[k])]));
    return { day: isoDay(day), observations: sorted, note: clean, cycleDay, source: "self_observation" };
}
export function validateDiaryPayload(payload) {
    for (const key of Object.keys(payload))
        if (forbidden.includes(key.toLowerCase()))
            throw new Error(`forbidden predictive/medical key: ${key} `);
    if (!payload.observations || typeof payload.observations !== "object" || Array.isArray(payload.observations))
        throw new Error("observations must be an object");
    return makeDiaryEntry(String(payload.day ?? ""), payload.observations, String(payload.note ?? ""), payload.cycle_day === undefined ? null : Number(payload.cycle_day));
}
export function orderDiary(entries) {
    const rows = [...entries].sort((a, b) => a.day.localeCompare(b.day));
    if (new Set(rows.map(x => x.day)).size !== rows.length)
        throw new Error("only one diary entry per day is supported");
    return rows;
}
export function diarySummary(entries) {
    const rows = orderDiary(entries), values = new Map();
    for (const e of rows)
        for (const [k, v] of Object.entries(e.observations)) {
            const a = values.get(k) ?? [];
            a.push(v);
            values.set(k, a);
        }
    const means = Object.fromEntries([...values].map(([k, a]) => [k, a.reduce((s, v) => s + v, 0) / a.length])), ranges = Object.fromEntries([...values].map(([k, a]) => [k, [Math.min(...a), Math.max(...a)]]));
    return { entries: rows.length, firstDay: rows.at(0)?.day ?? null, lastDay: rows.at(-1)?.day ?? null, means, ranges, cycleDayEntries: rows.filter(x => x.cycleDay !== null).length, predictive: false };
}
export function serialiseDiary(entries, consent) {
    if (!consent)
        throw new Error("explicit local health-data consent is required for diary export");
    return JSON.stringify({ schema: "beljour.r16b.skin-diary.v1", label: "SELF-OBSERVATION · NOT MEDICAL ADVICE", predictive: false, entries: orderDiary(entries) }, null, 0);
}
export function parseDiary(text, consent) {
    if (!consent)
        throw new Error("explicit local health-data consent is required for diary import");
    const raw = JSON.parse(text);
    if (raw.schema !== "beljour.r16b.skin-diary.v1")
        throw new Error("unsupported diary schema");
    if (raw.predictive !== false)
        throw new Error("predictive diary payloads are refused");
    return orderDiary((raw.entries ?? []).map((e) => makeDiaryEntry(e.day, e.observations, e.note, e.cycleDay)));
}
export function diaryTrend(entries, field) {
    const rows = [];
    for (const [i, e] of orderDiary(entries).entries()) {
        const value = e.observations[field];
        if (value !== undefined)
            rows.push([i, value]);
    }
    if (rows.length < 2)
        return { points: rows.length, slope: null, predictive: false };
    const xm = rows.reduce((s, r) => s + r[0], 0) / rows.length;
    const ym = rows.reduce((s, r) => s + r[1], 0) / rows.length;
    const den = rows.reduce((s, r) => s + (r[0] - xm) ** 2, 0);
    const slope = den ? rows.reduce((s, r) => s + (r[0] - xm) * (r[1] - ym), 0) / den : 0;
    return { points: rows.length, slope, predictive: false };
}
//# sourceMappingURL=diary_secure.js.map