/** R17B makeup contracts. Author: John Khan. */
export const FEATURES = ["W1", "W2", "W4", "W5", "W7", "W8", "W9", "W10", "W11", "W12", "W13", "W14", "W16", "W17", "W18"];
const bounded = (v, d, lo, hi, n) => { const x = v ?? d; if (!Number.isFinite(x) || x < lo || x > hi)
    throw new RangeError(`${n} outside range`); return x; };
export function parseMakeupOptions(v) { if (!FEATURES.includes(v.feature))
    throw new RangeError("unsupported makeup feature"); const seed = bounded(v.seed, 17, 0, 2 ** 32 - 1, "seed"); if (!Number.isInteger(seed))
    throw new RangeError("seed must be integer"); return { feature: v.feature, amount: bounded(v.amount, .5, 0, 1, "amount"), shade: v.shade ?? [128, 62, 68], accent: v.accent ?? [178, 104, 86], finish: v.finish ?? "satin", face_shape: v.face_shape ?? "balanced", undertone: v.undertone ?? "neutral", oxidation_delta: bounded(v.oxidation_delta, 0, -20, 20, "oxidation_delta"), season_shift: bounded(v.season_shift, 0, -1, 1, "season_shift"), look: v.look ?? "gallery_glow", seed, metadata: v.metadata ?? {} }; }
