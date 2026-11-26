/** Skin-mask-only undertone-colour simulation with original seeded freckles.
 * Mirrors api/plumb_api/engines/skin/glow_tan.py. Author: John Khan.
 */
import { blank, finitePhotograph, readLab, validate, writeLab } from "../beauty/effect-core.js";
export const SHIFTS = {
    olive: [0.5, 4.2], cool: [2.4, 2.0], warm: [0.9, 4.4], neutral: [1.5, 3.1],
};
export const LABEL = "Summer colour simulation with optional synthetic freckles; not a UV exposure guide.";
export function glowTan(image, skin, undertone = "neutral", strength = 55, freckles = false, seed = 41, depthL = 4, shiftScale = 1) {
    validate(image, skin, strength);
    finitePhotograph(image);
    if (!(undertone in SHIFTS))
        throw new RangeError("unknown undertone");
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new RangeError("freckle seed must be uint32");
    const result = { ...blank(image, "no observed skin or zero strength"), frecklesSeeded: 0 };
    if (strength === 0)
        return result;
    const { width: w, height: h } = image;
    const oldLab = [];
    const revised = [];
    for (let i = 0; i < skin.length; i++) {
        const base = readLab(image, i);
        oldLab.push(base);
        const amount = skin[i] >= 0.5 ? strength / 100 : 0;
        result.alpha[i] = amount;
        revised.push([base[0] - depthL * amount, base[1] + amount * SHIFTS[undertone][0] * shiftScale,
            base[2] + amount * SHIFTS[undertone][1] * shiftScale]);
        if (amount > 0)
            result.changed++;
    }
    if (result.changed === 0)
        return result;
    if (freckles) {
        let state = seed >>> 0;
        const next = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
        const n = Math.min(120, Math.max(12, Math.floor(w * h / 400)));
        const radiusScale = Math.max(0.75, Math.min(w, h) / 100);
        for (let j = 0; j < n; j++) {
            const cx = (0.22 + 0.56 * next()) * (w - 1), cy = (0.25 + 0.4 * next()) * (h - 1);
            const radius = radiusScale * (0.75 + 0.65 * next());
            // Python round is ties-to-even, but exact midpoint from RNG is essentially impossible.
            const mx = Math.round(cx), my = Math.round(cy);
            if (skin[my * w + mx] < 0.5)
                continue;
            const x0 = Math.max(0, Math.trunc(cx - 3 * radius)), x1 = Math.min(w, Math.trunc(cx + 3 * radius) + 2);
            const y0 = Math.max(0, Math.trunc(cy - 3 * radius)), y1 = Math.min(h, Math.trunc(cy + 3 * radius) + 2);
            for (let y = y0; y < y1; y++)
                for (let x = x0; x < x1; x++) {
                    const i = y * w + x;
                    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
                    revised[i][0] -= 5 * result.alpha[i] * Math.exp(-d2 / (2 * radius * radius));
                }
            result.frecklesSeeded++;
        }
    }
    for (let i = 0; i < skin.length; i++) {
        if (result.alpha[i] === 0)
            continue;
        writeLab(result.image, i, revised[i]);
        // Mirrors the no-lightening post-quantization guard in Python.
        const r = result.image;
        const newL = readLab({ width: w, height: h, channels: 3, data: r }, i)[0];
        if (newL > oldLab[i][0] + 1e-7)
            for (let ch = 0; ch < 3; ch++)
                r[i * 3 + ch] = image.data[i * 3 + ch];
    }
    result.reason = "measured local colour edit";
    return result;
}
//# sourceMappingURL=glow-tan.js.map