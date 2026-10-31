/** The public 48-style men's portfolio and per-render evidence, in the browser.
 * Mirrors api/plumb_api/engines/menshair/portfolio.py. ASSUMED selection rule, source
 * order: the first 33 short-sides concepts (fade, taper, undercut, crew, crop, buzz), then
 * the first "masculine" concept of each other family until 48. Every style renders with
 * renderStyleForFace (1.0-5.0 strength, default identity lock); renderEvidence() checks that
 * pixels really changed, the source is untouched, nothing outside the clipped hair mask
 * changed and alpha is unchanged. Level 1.0 is "unchanged", not a render.
 * Tonal simulation, not a haircut prediction. Author: John Khan.
 */
import { renderStyleForFace } from "./public-render.js";
export const SHORT_SIDES = ["fade", "taper", "undercut", "crew", "crop", "buzz"];
export const SHORT_SIDES_COUNT = 33;
export const PORTFOLIO_SIZE = 48;
const isShort = (style) => SHORT_SIDES.includes(style.family);
/** Apply the selection rule to a catalogue in source order. */
export function selectPortfolio(source) {
    const short = source.styles.filter(isShort).slice(0, SHORT_SIDES_COUNT);
    const others = [];
    const families = new Set();
    for (const style of source.styles) {
        if (short.length + others.length === PORTFOLIO_SIZE)
            break;
        if (!isShort(style) && (style.presentation ?? "unisex") === "masculine" && !families.has(style.family)) {
            families.add(style.family);
            others.push(style);
        }
    }
    if (short.length !== SHORT_SIDES_COUNT || short.length + others.length !== PORTFOLIO_SIZE) {
        throw new RangeError("The catalogue cannot supply the 48-style portfolio");
    }
    return Object.freeze([...short, ...others]);
}
/** Render one portfolio style and check what actually happened to the pixels. */
export function renderEvidence(image, width, height, mask, landmarks, styleId, level, source, options = {}) {
    if (!selectPortfolio(source).some((s) => s.id === styleId))
        throw new RangeError("Not a portfolio style");
    const before = new Uint8Array(image);
    const result = renderStyleForFace(image, width, height, mask, landmarks, styleId, level, source, options);
    const sourceUnchanged = before.every((v, i) => v === image[i]);
    const base = { style_id: styleId, provider_calls: 0 };
    if (!result.rendered) {
        return Object.freeze({ ...base, level, status: "refused", code: result.code, changed_pixels: 0,
            source_unchanged: sourceUnchanged, outside_unchanged: true, alpha_unchanged: true, verified: false });
    }
    const channels = image.length / (width * height);
    const box = options.primaryBox ?? [0, 0, width, height];
    let changed = 0, outside = true, alpha = true;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const inside = mask[i] > 0 && x >= box[0] && x < box[2] && y >= box[1] && y < box[3];
            if ([0, 1, 2].some((c) => result.pixels[i * channels + c] !== before[i * channels + c])) {
                changed += 1;
                if (!inside)
                    outside = false;
            }
            if (channels === 4 && result.pixels[i * 4 + 3] !== before[i * 4 + 3])
                alpha = false;
        }
    const status = changed ? "rendered" : "unchanged";
    return Object.freeze({ ...base, level: result.level, status, code: null, changed_pixels: changed,
        source_unchanged: sourceUnchanged, outside_unchanged: outside, alpha_unchanged: alpha,
        verified: status === "rendered" && sourceUnchanged && outside && alpha });
}
