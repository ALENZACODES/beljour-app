/** Validated R16B lip contracts. Author: John Khan. */
export const FEATURES = ["W45", "W46", "W47", "W48", "W49", "W54", "W55", "W56", "W57"];
export const STYLES = { W45: ["natural_plump", "cupid_focus", "keyhole", "vertical_lift"], W46: ["balanced", "cupid_only", "soft_outer"], W47: ["healed", "fresh", "month_6", "month_12", "month_18"], W48: ["rest", "smile"], W49: ["0.5_ml_style", "1.0_ml_style"], W54: ["blue_based", "neutral", "warm_based"], W55: ["matte", "satin", "gloss", "stain"], W56: ["two_hours", "coffee", "meal"], W57: ["sheer", "medium", "opaque"] };
export const LABEL = "Local lip simulation. Cosmetic or consultation preview only; not a predicted clinical result.";
export const VERSION = "lips-r16b/1";
const finite = (v, name, lo, hi) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
        throw new RangeError(`${name}  must be in ${lo} ..${hi} `);
    return v;
};
const rgb = (v, name) => {
    if (!Array.isArray(v) || v.length !== 3)
        throw new TypeError(`${name}  must have 3 channels`);
    const a = v.map(x => finite(x, name, 0, 255));
    if (a.some(x => !Number.isInteger(x)))
        throw new TypeError(`${name}  channels must be integers`);
    return [a[0], a[1], a[2]];
};
export function parseOptions(v) {
    if (!FEATURES.includes(v.feature))
        throw new RangeError("unsupported lip feature");
    const style = v.style ?? "";
    if (style && !STYLES[v.feature].includes(style))
        throw new RangeError("unsupported lip style");
    return { feature: v.feature, amount: finite(v.amount ?? .5, "amount", 0, 1), style, colour: rgb(v.colour ?? [155, 55, 75], "colour"), liner_colour: rgb(v.liner_colour ?? [103, 42, 55], "liner_colour"), shine: finite(v.shine ?? .25, "shine", 0, 1), feather: finite(v.feather ?? .18, "feather", 0, 1), preserve_texture: finite(v.preserve_texture ?? 1, "preserve_texture", .5, 1), daylight: finite(v.daylight ?? .5, "daylight", 0, 1), two_tone_balance: finite(v.two_tone_balance ?? .5, "two_tone_balance", 0, 1), seed: finite(v.seed ?? 17, "seed", 0, 2 ** 32 - 1), metadata: v.metadata ?? {} };
}
export function validatePhoto(p) {
    if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 8 || p.height < 8 || p.width * p.height > 4194304)
        throw new RangeError("unsupported photo size");
    if (p.channels !== 3 && p.channels !== 4)
        throw new RangeError("photo channels must be 3 or 4");
    if (p.data.length !== p.width * p.height * p.channels)
        throw new RangeError("photo data length mismatch");
}
export function validateLandmarks(p) {
    if (p.length !== 468 && p.length !== 478)
        throw new RangeError("468 or 478 landmarks required");
    for (const [x, y] of p)
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < -.25 || x > 1.25 || y < -.25 || y > 1.25)
            throw new RangeError("invalid landmark");
}
