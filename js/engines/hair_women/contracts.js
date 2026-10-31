/** R17B women hair contracts. Author: John Khan. */
export const FEATURES = ["W19", "W20", "W21", "W22", "W23", "W24", "W25", "W26", "W29", "W30", "W31", "W32", "W33", "W34", "W35", "W36", "W37", "W38", "W40", "W41", "W42", "W43", "W44"];
const bounded = (v, d, lo, hi, name) => { const x = v ?? d; if (!Number.isFinite(x) || x < lo || x > hi)
    throw new RangeError(`${name} outside range`); return x; };
export function parseHairOptions(value) { if (!FEATURES.includes(value.feature))
    throw new RangeError("unsupported hair feature"); const month = bounded(value.month, 0, 0, 36, "month"), seed = bounded(value.seed, 17, 0, 2 ** 32 - 1, "seed"); if (!Number.isInteger(month) || !Number.isInteger(seed))
    throw new RangeError("month and seed must be integers"); return { feature: value.feature, amount: bounded(value.amount, .5, 0, 1, "amount"), colour: value.colour ?? [92, 58, 40], accent: value.accent ?? [176, 122, 78], length_ratio: bounded(value.length_ratio, .25, 0, 1, "length_ratio"), volume: bounded(value.volume, .35, 0, 1, "volume"), grey_share: bounded(value.grey_share, .35, 0, 1, "grey_share"), month, curl_strength: bounded(value.curl_strength, .5, 0, 1, "curl_strength"), heat_shape: bounded(value.heat_shape, .4, 0, 1, "heat_shape"), humidity: bounded(value.humidity, 50, 0, 100, "humidity"), scalp_sensitivity: value.scalp_sensitivity ?? value.feature === "W42", seed, metadata: value.metadata ?? {} }; }
export function validatePhoto(photo) { if (!Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 16 || photo.height < 16)
    throw new RangeError("invalid dimensions"); if (photo.channels !== 3 && photo.channels !== 4)
    throw new RangeError("invalid channels"); if (photo.data.length !== photo.width * photo.height * photo.channels)
    throw new RangeError("invalid photo buffer"); }
export function validateMask(mask, photo, name) { if (mask.length !== photo.width * photo.height)
    throw new RangeError(`${name} size mismatch`); for (const v of mask)
    if (!Number.isFinite(v) || v < 0 || v > 1)
        throw new RangeError(`${name} outside 0..1`); }
export function validateGeometry(g) { for (const p of [g.crown, g.left_temple, g.right_temple, g.chin])
    for (const v of p)
        if (!Number.isFinite(v) || v < -.25 || v > 1.25)
            throw new RangeError("invalid head landmark"); if (Math.abs(g.right_temple[0] - g.left_temple[0]) < .05 || Math.abs(g.chin[1] - g.crown[1]) < .1)
    throw new RangeError("degenerate head landmarks"); }
