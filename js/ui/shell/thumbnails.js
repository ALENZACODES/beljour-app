/** FS7 thumbnail strip: every option of a local tool previewed on your own photo, free.
 *
 * The plan: "Thumbnails on your own photo for every local tool (computed at 128 px in a
 * worker, free); YouCam tools show recorded samples and render on tap, with the unit price on
 * the button." Here each option (an enhance mode, a beard style, a fibre product, a posture
 * fix) is one layer rendered by the R7 engine on a 128 px copy of the source (scale.ts).
 * Provider tools get an honest tile instead: the studio page never sends a photo, so their
 * previews open on the styling screen where the price is shown before anything is spent.
 * Render time per tile is measured against the ASSUMED 50 ms budget and reported, not hidden.
 *
 * Ready for a large ranked catalogue (the filter pack, filters-plan.md): every option has a rank
 * (1 = shown first), the strip renders one page at a time (STRIP_PAGE tiles), and the page
 * offers the next page on request, so 100+ looks never render all at once.
 *
 * Author: John Khan.
 */
import { GENTLE_DEFAULT } from "../../layout/effects.js";
import { MODES } from "../../engines/local/enhance.js";
import { STYLES } from "../../engines/local/beard.js";
import { PRODUCTS } from "../../engines/local/strands.js";
import { fixesFor } from "../../engines/local/posture.js";
import { readiness, tool } from "./catalogue.js";
import { layer } from "./layers.js";
import { renderLayers } from "./pipeline.js";
import { scaleSource } from "./scale.js";
import { POSTURE_DEFAULTS } from "./settings.js";
import { SKIN_DEFAULTS } from "./skin-layer.js";
import { UNDER_EYE_DEFAULTS } from "./under-eye-layer.js";
import { ILLUSTRATION_DEFAULTS, STUDIO_DEFAULTS } from "./studio-layer.js";
import { retouchDefaults } from "../../editor/brush/layer.js";
import { LOOKS as ILLUSTRATION_LOOKS } from "../../engines/studio/illustration.js";
import { defaultFilterParams, filterOptions, renderFilterTile } from "../../filters/runtime/layer.js";
import { defaultPortraitParams, portraitOptions } from "../../filters/portrait/layer.js";
import { SELECTIVE_START, editorOptions } from "../../editor/adjust/options.js";
import { LOCAL_KINDS, isSimulationKind } from "./types.js";
export const THUMB_SIDE = 128;
/** ASSUMED per-tile budget from plan FS7; measured on each device, reported in the tile. */
export const THUMB_BUDGET_MS = 50;
/** Previews render at the gentle default, so a tile shows what one tap gives her (layout v1). */
export const DEFAULT_STRENGTH = GENTLE_DEFAULT;
export const STRIP_PAGE = 12;
const words = (id) => id.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
/** Default parameters for a new layer of this kind (the controller's defaults, in one place). */
export function defaultParams(kind, source) {
    if (kind === "older" || kind === "younger")
        return { stop: 1 };
    if (kind === "gender")
        return { slider: -33 };
    if (kind === "lighting")
        return { preset: "daylight" };
    if (kind === "recolour")
        return { colour: "#6B3F2A", curl_pattern: "not specified" };
    if (kind === "balayage")
        return { target_level: 7, history: "colour_treated", toner: "none", softness: 4 };
    if (kind === "filters")
        return defaultFilterParams();
    if (kind === "portrait")
        return defaultPortraitParams();
    if (kind === "enhance")
        return { mode: "natural" };
    if (kind === "skin")
        return { ...SKIN_DEFAULTS };
    if (kind === "under-eye")
        return { ...UNDER_EYE_DEFAULTS };
    if (kind === "grey")
        return { stage: "cover" };
    if (kind === "shave")
        return {};
    if (kind === "teeth")
        return {};
    if (kind === "studio")
        return { ...STUDIO_DEFAULTS };
    if (kind === "illustration")
        return { ...ILLUSTRATION_DEFAULTS };
    if (kind === "retouch")
        return retouchDefaults();
    if (kind === "adjust" || kind === "mixer" || kind === "curves" || kind === "crop")
        return {};
    if (kind === "selective")
        return { ...SELECTIVE_START };
    if (kind === "posture")
        return { fix: source.body?.view === "side" ? "forward_head" : "lean",
            band_share: POSTURE_DEFAULTS.bandShare, cap_share: POSTURE_DEFAULTS.capShare };
    if (kind === "beard")
        return { style: "stubble", colour: "#3B2A22", length: 3 };
    return { product: "fibres" };
}
/** The options a tool's strip shows. Posture options follow the photo's front or side view;
 * filter options are every look in §2.22 rank order, each at its own gentle default. */
export function optionsFor(kind, source) {
    if (kind === "filters") {
        return filterOptions().map((o) => ({ id: o.id, kind, key: "recipe", label: o.label, params: o.params, strength: o.strength, rank: o.rank }));
    }
    if (kind === "portrait") {
        return portraitOptions().map((o) => ({ id: o.id, kind, key: "look", label: o.label, params: o.params, strength: o.strength, rank: o.rank }));
    }
    const base = defaultParams(kind, source);
    const make = (key, value, i) => ({ id: `${kind}:${key}:${value}`, kind, key, label: words(value),
        params: { ...base, [key]: value }, strength: DEFAULT_STRENGTH, rank: i + 1 });
    if (kind === "older" || kind === "younger")
        return Array.from({ length: kind === "older" ? 5 : 3 }, (_, i) => ({ ...make("stop", String(i + 1), i), params: { stop: i + 1 }, label: `${kind === "older" ? "Older" : "Younger"} ${i + 1}` }));
    if (kind === "gender")
        return [-100, -66, -33, 0, 33, 66, 100].map((slider, i) => ({ ...make("slider", String(slider), i), params: { slider },
            label: slider === 0 ? "Original" : `${Math.abs(slider) === 33 ? "Normal" : Math.abs(slider) === 66 ? "Extra" : "Hyper"} ${slider < 0 ? "feminine" : "masculine"}` }));
    if (kind === "lighting")
        return ["daylight", "office", "evening"].map((p, i) => ({ ...make("preset", p, i), strength: 100 }));
    if (kind === "recolour")
        return ["#6B3F2A", "#3D2924", "#8B5738"].map((p, i) => ({ ...make("colour", p, i), label: ["Warm brown", "Deep brown", "Copper brown"][i] }));
    if (kind === "balayage")
        return ["none", "ash", "violet"].map((p, i) => make("toner", p, i));
    if (kind === "enhance")
        return Object.keys(MODES).map((m, i) => make("mode", m, i));
    // Skin: one tile per tool. Tan tiles only ever add a tan; removal is never offered as a tile.
    if (kind === "skin")
        return [["tone", {}, "Even tone"], ["matte", {}, "Matte"], ["glow", { style: "cassis" }, "Glow Cassis"],
            ["glow", { style: "collioure" }, "Glow Collioure"], ["freckles", {}, "Freckles"], ["tan", { direction: "add" }, "Tan"]]
            .map(([t, extra, label], i) => ({ ...make("tool", `${t}${"style" in extra ? `-${extra.style}` : ""}`, i), label,
            params: { ...base, tool: t, ...extra, allow_lightening: false } }));
    if (kind === "under-eye")
        return [{ ...make("bags", "with-bags", 0), label: "Circles and bags", params: { include_bags: true } },
            { ...make("bags", "circles-only", 1), label: "Dark circles only", params: { include_bags: false } }];
    if (kind === "teeth")
        return [{ ...make("cap", "natural", 0), label: "Natural white", params: {} }];
    if (kind === "shave")
        return [{ ...make("scope", "clean", 0), label: "Clean shave", params: {} }];
    if (kind === "grey")
        return [["cover", "Cover greys"], ["blend", "Blend greys"], ["silver", "Go silver"]]
            .map(([stage, label], i) => ({ ...make("stage", stage, i), label, params: { stage } }));
    // Studio: the two background tools on the drawn backdrops a headshot uses; face tools run from the panel.
    if (kind === "studio")
        return [["blur", {}, "Background blur"], ["replace", { backdrop: "chinon" }, "Chinon slate"],
            ["replace", { backdrop: "chablis" }, "Chablis ivory"], ["replace", { backdrop: "cahors" }, "Cahors canvas"]]
            .map(([t, extra, label], i) => ({ ...make("tool", `${t}${"backdrop" in extra ? `-${extra.backdrop}` : ""}`, i), label,
            params: { ...base, tool: t, ...extra } }));
    if (kind === "illustration")
        return Object.entries(ILLUSTRATION_LOOKS).map(([look, row], i) => ({ ...make("look", look, i), label: row.name }));
    // Retouch brushes are painted on the photo; a tile cannot know where, so the strip offers none.
    if (kind === "retouch")
        return [];
    if (kind === "adjust" || kind === "mixer" || kind === "curves" || kind === "crop" || kind === "selective")
        return editorOptions(kind, source);
    if (kind === "beard")
        return Object.keys(STYLES).map((s, i) => make("style", s, i));
    if (kind === "hair-fibre")
        return PRODUCTS.map((p, i) => make("product", p, i));
    if (!source.body)
        return [];
    return fixesFor(source.body.view).map((f, i) => make("fix", f, i));
}
/** Stable rank order: lower rank first, then the option id, so equal ranks never shuffle. */
export function rankOptions(options) {
    for (const o of options)
        if (!(Number.isInteger(o.rank) && o.rank >= 1))
            throw new RangeError(`Option ${o.id} needs a whole rank of 1 or more`);
    return [...options].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function pageOf(items, page, size) {
    if (!(Number.isInteger(size) && size >= 1 && size <= 200))
        throw new RangeError("Page size must be 1–200");
    const pages = Math.max(1, Math.ceil(items.length / size));
    if (!(Number.isInteger(page) && page >= 0 && page < pages))
        throw new RangeError(`Page must be 0–${pages - 1}`);
    return { items: items.slice(page * size, (page + 1) * size), page, pages, total: items.length, more: page < pages - 1 };
}
export function isLocalStudio(id) { return LOCAL_KINDS.includes(id); }
export function optionLayer(option, origin) {
    const item = layer(`thumb-${option.kind}`, option.kind, tool(option.kind).title, origin, option.params);
    return { ...item, strength: option.strength };
}
/** Tiles without pixels: what the strip shows while the worker renders, or when it can't. */
export function planStrip(studio, source) {
    const row = tool(studio);
    if (row.source === "planned")
        return [{ option: null, status: "planned", label: row.title, simulation: false,
                reason: "Filters come after the must-have tools. This slot is reserved." }];
    if (row.source === "youcam")
        return [{ option: null, status: "provider", label: row.title, simulation: false,
                reason: "Recorded examples and live previews open on the styling screen, with the unit price on the button. This page never sends your photo." }];
    const kind = studio, ready = readiness(kind, source);
    if (!ready.ready)
        return [{ option: null, status: "blocked", label: row.title, reason: ready.reason, simulation: false }];
    return rankOptions(optionsFor(kind, source)).map((option) => ({ option, status: "ready", label: option.label,
        simulation: isSimulationKind(kind) }));
}
function samePreview(a, b) {
    if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels)
        return false;
    for (let i = 0; i < a.data.length; i++)
        if (a.data[i] !== b.data[i])
            return false;
    return true;
}
/** Rescue modes can legitimately converge when a photo needs only one pass. Describe
 * actual pixels instead of adding a cosmetic change to manufacture different tiles.
 * Called again when pages join, so a duplicate can refer to an earlier visible page. */
export function annotateEnhancePreviews(tiles) {
    const seen = [];
    return tiles.map((tile) => {
        if (tile.status !== "ready" || !tile.enhance || !tile.image)
            return tile;
        const earlier = seen.find((other) => samePreview(other.image, tile.image));
        seen.push(tile);
        const note = tile.enhance.unchanged
            ? tile.enhance.condition === "normal" ? "No rescue needed. Preview unchanged." : "Preview unchanged at this strength."
            : earlier ? `Same preview as ${earlier.label}.` : undefined;
        return { ...tile, note };
    });
}
/** Render one page of a tool's strip on a small copy of the photo. Pure apart from the clock. */
export function renderStripPage(studio, source, { side = THUMB_SIDE, clock = () => performance.now(), page = 0, pageSize = STRIP_PAGE } = {}) {
    const plan = planStrip(studio, source);
    if (!plan.some((tile) => tile.option))
        return { tiles: plan, page: 0, pages: 1, total: 0, more: false };
    const window = pageOf(plan, page, pageSize);
    const small = scaleSource(source, side);
    const origin = source.kind === "sample" ? "sample" : "photo";
    const tiles = window.items.map((tile) => {
        if (!tile.option)
            return tile;
        const start = clock();
        try {
            const preview = tile.option.kind === "filters" ? null : renderLayers(small, [optionLayer(tile.option, origin)]);
            const image = preview ? preview.image : renderFilterTile(small, { recipe: String(tile.option.params.recipe),
                params: { ...tile.option.params }, strength: tile.option.strength });
            const metrics = preview?.metrics[0];
            const enhance = tile.option.kind === "enhance" && metrics ? {
                condition: String(metrics.condition), effectiveMode: String(metrics.effective_mode),
                exposureApplied: metrics.exposure_applied === true, unchanged: metrics.unchanged === true,
            } : undefined;
            const ms = Math.round((clock() - start) * 10) / 10;
            return { ...tile, image, enhance, ms, overBudget: ms > THUMB_BUDGET_MS };
        }
        catch (error) {
            return { ...tile, status: "blocked", image: undefined, reason: error instanceof Error ? error.message : String(error) };
        }
    });
    return { tiles: annotateEnhancePreviews(tiles), page: window.page, pages: window.pages, total: window.total, more: window.more };
}
/** Every page of a tool's strip at once (the filter strip pages; this renders them all). */
export function renderStrip(studio, source, options = {}) {
    return renderStripPage(studio, source, { ...options, page: 0, pageSize: 200 }).tiles;
}
/** Rendered strips per source and tool, so going back to a tool is instant. */
export class StripCache {
    limit;
    items = new Map();
    constructor(limit = 24) {
        this.limit = limit;
    }
    key(source, studio, page = 0) {
        return `${source.id}|${source.geometryRevision ?? 0}|${studio}|${source.hair ? "h" : ""}${source.hairPaint ? "p" : ""}${source.crown ? "c" : ""}${source.body ? source.body.view : ""}${source.face ? "f" : ""}|${page}`;
    }
    get(source, studio, page = 0) { return this.items.get(this.key(source, studio, page)); }
    set(source, studio, tiles, page = 0) {
        const key = this.key(source, studio, page);
        this.items.delete(key);
        this.items.set(key, tiles);
        while (this.items.size > this.limit)
            this.items.delete(this.items.keys().next().value);
    }
    clear() { this.items.clear(); }
    get size() { return this.items.size; }
}
/** Which tile matches the selected layer's current option, for aria-pressed in the strip. */
export function activeOption(tiles, selected) {
    if (!selected)
        return null;
    const hit = tiles.find((t) => t.option && t.option.kind === selected.kind && selected.parameters[t.option.key] === t.option.params[t.option.key]);
    return hit?.option?.id ?? null;
}
//# sourceMappingURL=thumbnails.js.map