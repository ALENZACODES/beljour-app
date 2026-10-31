import { DEG, RAD, decode1, encode1, labToSrgb, srgbToLab, unitToByte, wrapDegrees } from "../colour/space.js";
export const HUE_MAX = 6;
export const HUE_MARGIN = 1;
export const MIN_CHROMA = 2;
/** Never assume a person-only segmentation is a reliable face/skin mask. */
export function faceMask(masks) {
    if (masks.skin !== null)
        return masks.skin;
    return masks.source === "landmarks" ? masks.person : null;
}
/** Optionally write into an owned output buffer, so a tiled export can reuse
 * its final image storage instead of holding another full-resolution RGB copy.
 * The source and styled look remain unchanged. */
export function clampHue(before, styled, mask, target) {
    if (before.length !== styled.length || before.length % 3 !== 0)
        throw new RangeError("hue lock needs equal RGB frames");
    if (target && (target.length !== styled.length || target.buffer === before.buffer ||
        target.buffer === styled.buffer)) {
        throw new RangeError("hue lock output must be equal-sized and disjoint from its inputs");
    }
    const out = target ?? new Uint8Array(styled.length);
    out.set(styled);
    if (!mask)
        return out;
    if (mask.data.length * 3 !== before.length)
        throw new RangeError("hue lock mask and image differ");
    const cb = new Float64Array(3), ca = new Float64Array(3), rgb = new Float64Array(3);
    const cap = HUE_MAX - HUE_MARGIN;
    for (let p = 0; p < mask.data.length; p++) {
        const value = mask.data[p];
        if (!Number.isFinite(value) || value < 0 || value > 1)
            throw new RangeError("hue lock mask must be finite 0..1");
        const alpha = Math.min(1, 2 * value);
        if (alpha === 0)
            continue;
        const i = 3 * p;
        srgbToLab(before[i] / 255, before[i + 1] / 255, before[i + 2] / 255, cb);
        srgbToLab(styled[i] / 255, styled[i + 1] / 255, styled[i + 2] / 255, ca);
        const chromaBefore = Math.hypot(cb[1], cb[2]);
        const chromaAfter = Math.hypot(ca[1], ca[2]);
        if (chromaBefore < MIN_CHROMA || chromaAfter < MIN_CHROMA)
            continue;
        const hueBefore = Math.atan2(cb[2], cb[1]) * DEG;
        const turn = wrapDegrees(Math.atan2(ca[2], ca[1]) * DEG - hueBefore);
        if (Math.abs(turn) <= cap)
            continue;
        const newAngle = (hueBefore + Math.max(-cap, Math.min(cap, turn))) * RAD;
        labToSrgb(ca[0], chromaAfter * Math.cos(newAngle), chromaAfter * Math.sin(newAngle), rgb);
        for (let c = 0; c < 3; c++) {
            const original = styled[i + c] / 255;
            const blended = encode1(decode1(original) + alpha * (decode1(rgb[c]) - decode1(original)));
            out[i + c] = unitToByte(blended);
        }
    }
    return out;
}
