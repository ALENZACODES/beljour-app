/** Product pictures for the Skin Moment plan: one plain, unbranded product type per picture,
 * which John makes himself and drops into web/assets/skin-moment/products/ as
 * product-<id>.png. A picture shows what a step or a product type means; it is never a real
 * product, and its alt text names the product type only.
 *
 * Steps and product types reach a picture in two ways:
 *   * a catalogue product (api/plumb_api/data/skin_match_catalogue.json) by its id, the part
 *     before the first ":" for the base products ("base-foundation:medium:warm");
 *   * a plan line (services/skin_moment.build_plan, from the services/skin.py routine and the
 *     skin guide habits, and the saved examples in skin-moment-demo.ts) by the first product word
 *     it names, so "Salicylic acid (BHA) on the same night as Retinol" shows the exfoliant.
 * A line that names no product ("Change pillowcases twice a week") gets no picture. Whether the
 * file is there comes from the build's index.json (skin-moment-art.ts); nothing is fetched to
 * find out, and a missing file shows nothing.
 * Author: John Khan.
 */
export const PRODUCTS_DIR = "products/";
/** Every picture slot and the product type its alt text names. */
export const PRODUCT_TYPES = {
    "skin-tint": "Skin tint",
    "foundation-sheer": "Sheer liquid foundation",
    "foundation-medium": "Medium-coverage foundation",
    "foundation-full": "Full-coverage foundation",
    "concealer": "Concealer",
    "corrector-green": "Green colour-correcting cream",
    "corrector-peach": "Peach colour-correcting cream",
    "primer": "Face primer",
    "setting-powder": "Translucent setting powder",
    "highlighter": "Highlighter",
    "blush-cream": "Cream blush",
    "blush-powder": "Powder blush",
    "lip-tint": "Lip tint",
    "lip-balm": "Tinted lip balm",
    "gentle-cleanser": "Gentle cleanser",
    "foam-cleanser": "Foaming cleanser",
    "moisturiser-light": "Light gel moisturiser",
    "moisturiser-rich": "Rich cream moisturiser",
    "sunscreen": "Broad-spectrum face sunscreen",
    "niacinamide-serum": "Niacinamide serum",
    "hyaluronic-serum": "Hyaluronic acid serum",
    "vitamin-c-serum": "Vitamin C serum",
    "azelaic-cream": "Azelaic acid cream",
    "salicylic-toner": "Salicylic acid toner",
    "benzoyl-gel": "Benzoyl peroxide spot gel",
    "retinoid-cream": "Retinoid night cream",
    "exfoliant-liquid": "Liquid exfoliant",
    "hydrating-mask": "Hydrating sheet mask",
    "clay-mask": "Clay mask",
    "spot-patches": "Spot patches",
    "ceramide-cream": "Ceramide barrier cream",
    "eye-cream": "Eye cream",
    // The diary's generic type, for a product that fits none of the above (a peptide serum, a
    // hypochlorous spray): she or the news page names it, the type only says "skincare".
    "skincare-other": "Other skincare product",
};
export const PRODUCT_IDS = Object.keys(PRODUCT_TYPES);
export function productFile(id) { return `${PRODUCTS_DIR}product-${id}.png`; }
/** Whether a file name (relative to assets/skin-moment/) is one of the product picture slots. */
export function isProductFile(file) {
    const m = /^products\/product-([a-z0-9-]+)\.png$/.exec(file);
    return !!m && m[1] in PRODUCT_TYPES;
}
/** The catalogue's product types (skin_match_catalogue.json) and their closest picture. */
export const CATALOGUE_PICTURES = {
    "base-skin-tint": "skin-tint", "base-foundation": "foundation-medium", "base-concealer": "concealer",
    "prep-hydrating-primer": "primer", "finish-dewy-tint": "skin-tint",
    "prep-mattifying-primer": "primer", "set-blotting-powder": "setting-powder",
    "correct-green-primer": "corrector-green", "prep-smoothing-primer": "primer",
    "prep-blurring-primer": "primer", "conceal-spot": "concealer", "prep-oil-free-primer": "primer",
    "base-flexible-fluid": "foundation-sheer",
    // corrector_by_depth runs pale peach to red-orange: all the peach family, never green.
    "correct-under-eye": "corrector-peach",
    "prep-cooling-eye-gel": "eye-cream", "conceal-spot-depth": "concealer",
    "finish-highlighter": "highlighter", "colour-cream-blush": "blush-cream",
};
export function productForCatalogue(id) {
    return CATALOGUE_PICTURES[id.split(":")[0]] ?? null;
}
// Product words in plan lines, most specific first; the earliest match in the line wins, and on
// a tie the rule listed first. Ingredient names are the skin guide's (api/plumb_api/data/
// skin_guide.json); "Peptides" has no picture of its own and gets none.
const LINE_RULES = [
    [/green colou?r[- ]correct/, "corrector-green"],
    [/corrector/, "corrector-peach"],
    [/full[- ]coverage/, "foundation-full"],
    [/sheer (liquid )?foundation|flexible fluid/, "foundation-sheer"],
    [/skin tint/, "skin-tint"],
    [/foundation/, "foundation-medium"],
    [/concealer/, "concealer"],
    [/primer/, "primer"],
    [/(setting|blotting) powder/, "setting-powder"],
    [/highlighter/, "highlighter"],
    [/cream blush/, "blush-cream"],
    [/blush/, "blush-powder"],
    [/lip (tint|colou?r)/, "lip-tint"],
    [/lip balm/, "lip-balm"],
    [/foam(ing)? cleanser/, "foam-cleanser"],
    [/cleanser/, "gentle-cleanser"],
    [/rich (cream|moisturiser)/, "moisturiser-rich"],
    [/moisturis/, "moisturiser-light"],
    [/sunscreen|\bspf\b/, "sunscreen"],
    [/niacinamide/, "niacinamide-serum"],
    [/hyaluronic/, "hyaluronic-serum"],
    [/vitamin c\b/, "vitamin-c-serum"],
    [/azelaic/, "azelaic-cream"],
    [/salicylic|\bbha\b/, "salicylic-toner"],
    [/benzoyl|spot[- ](care|treatment)/, "benzoyl-gel"],
    [/adapalene|retinol|retinoid/, "retinoid-cream"],
    [/glycolic|lactic|\baha\b|exfoliat/, "exfoliant-liquid"],
    [/sheet mask|hydrating mask/, "hydrating-mask"],
    [/clay/, "clay-mask"],
    [/patch/, "spot-patches"],
    [/ceramide/, "ceramide-cream"],
    [/eye (serum|cream|gel)/, "eye-cream"],
];
/** The picture for one plan line: the first product the line names, or null. */
export function productForLine(text) {
    const s = text.toLowerCase();
    let best = null;
    for (const [re, id] of LINE_RULES) {
        const m = re.exec(s);
        if (m && (best === null || m.index < best.at))
            best = { at: m.index, id };
    }
    return best?.id ?? null;
}
//# sourceMappingURL=skin-moment-products.js.map