/**
 * The interface palette for code that draws: canvas, SVG and generated files. The values are the
 * light tokens in web/theme.css (plum, blush and cream, John's decision 2026-10-29), checked
 * against that file by test/ui-palette.test.mjs. Code running in a page reads the live CSS
 * token with `token()`, so a page in dark mode draws in its dark values; generated files and
 * pinned outputs use `PALETTE` directly, so they never depend on a stylesheet.
 * Interface colours only: makeup and hair swatches, skin in drawings, shaders and colour maths
 * are content and keep their own values.
 * Author: John Khan.
 */
export const PALETTE = {
    plum: "#6B3044", // --plum / --bleu: headings, primary fills, links, focus, active
    plumDeep: "#4E1F33", // --plum-deep / --primary-hover
    blush: "#F2D9D6", // --blush / --on-bleu-soft: soft fills, secondary text on plum
    cream: "#FBF6EF", // --cream / --blanc: page background, text on plum
    wine: "#A3262A", // --wine / --rouge: Delete and warnings only
    ink: "#2B1A22", // --ink: body text
    muted: "#6A5560", // --muted / --gris: secondary text
    rule: "#E6D6D0", // --rule: 1px rules and borders
    panel: "#F5EAE4", // --panel / --ivoire: quiet panels
    surface: "#FFFDFA", // --surface: cards on the cream page
};
/** Colours drawn on her photo, the same in every theme. A mark is two-tone, a plum core on a
 * cream halo: on very fair skin the plum core reads, on very deep skin the cream halo does, and
 * between them at least one is 3:1 or more (test/photo-marks.test.mjs, on the drawn tones and the
 * example faces). The second overlay hue is an amber picked to sit 3:1 from plum and from the
 * cream page at once (no CSS token: it is used only for drawing). */
export const PHOTO_MARK = {
    core: PALETTE.plum,
    halo: PALETTE.cream,
    second: "#BA8513", // amber: 3.03:1 against plum and against cream (the most both allow)
};
/** The CSS custom property each palette name is read from in a page. */
export const TOKEN_OF = {
    plum: "--plum", plumDeep: "--plum-deep", blush: "--blush", cream: "--cream", wine: "--wine",
    ink: "--ink", muted: "--muted", rule: "--rule", panel: "--panel", surface: "--surface",
};
/** `#RRGGBB` as [r, g, b]. */
export function rgbOf(hex) {
    const n = parseInt(hex.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** `#RRGGBB` as `rgba(r, g, b, alpha)`, for translucent interface fills. */
export function withAlpha(hex, alpha) {
    const [r, g, b] = rgbOf(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/** The live `#RRGGBB` value of a palette token in this page (dark mode included), or the light
 * value when there is no page, the token is unset or not a hex colour, or the lookup throws. */
export function token(name, element) {
    try {
        const doc = globalThis.document;
        const target = element ?? doc?.documentElement;
        const view = target?.ownerDocument?.defaultView;
        if (target && view && typeof view.getComputedStyle === "function") {
            const value = view.getComputedStyle(target).getPropertyValue(TOKEN_OF[name]).trim();
            if (/^#[0-9a-f]{6}$/i.test(value))
                return value.toUpperCase();
        }
    }
    catch { /* no page or a blocked lookup: fall back to the light value */ }
    return PALETTE[name];
}
//# sourceMappingURL=palette.js.map