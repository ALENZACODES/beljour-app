import { NO_MASKS, fromLandmarks, fromPerson, maskCentre } from "../masks/blend.js";
import { catalogue } from "../recipe/registry.js";
import { ThumbCache, thumbKey, thumbSourceStamp } from "./cache.js";
import { render } from "./engine.js";
import { checkedLevel, fromPercent, toPercent } from "./strength.js";
/** The best daily default (§2.1 C08: "still me, best day"), used when a new filter layer has no pick. */
export const DEFAULT_RECIPE = "C08";
export const BUILT_ADDON_IDS = [
    "fade", "vignette", "centre-light", "glow", "halation", "border",
    "grain", "structure",
];
export const addonParamKey = (id) => `addon_${id.replace(/-/g, "_")}`;
export const PARAM_KEYS = [
    "recipe", "preset", "guard", "protect", "background", "identity_lock",
    "addon_fade", "addon_vignette", "addon_centre_light", "addon_glow",
    "addon_halation", "addon_border", "addon_grain", "addon_structure",
];
export function defaultFilterParams(recipeId = DEFAULT_RECIPE) {
    const r = catalogue().get(recipeId);
    const params = { recipe: r.id, preset: "", guard: r.defaults.guard,
        protect: r.defaults.protectSkin, background: r.defaults.backgroundOnly, identity_lock: true };
    for (const id of BUILT_ADDON_IDS) {
        const manualOnly = catalogue().addons.get(id)?.manualOnly ?? false;
        params[addonParamKey(id)] = manualOnly ? 0 : r.defaults.addons.find((a) => a.id === id)?.amount ?? 0;
    }
    return params;
}
export function recipeFor(layer) {
    const id = layer.parameters.recipe;
    if (typeof id !== "string" || !catalogue().has(id))
        throw new RangeError("Pick a look for this filter layer");
    return catalogue().get(id);
}
export function settingsFor(layer) {
    const p = layer.parameters;
    const flag = (key) => (typeof p[key] === "boolean" ? p[key] : undefined);
    const addons = {};
    for (const id of BUILT_ADDON_IDS) {
        const value = p[addonParamKey(id)];
        if (value !== undefined) {
            if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
                throw new RangeError(`Add-on ${id} needs a finite non-negative amount`);
            }
            // The existing Fade inspector saturates out-of-range percentages. Retain
            // that backward-compatible behaviour for each additive control.
            // A new filter layer begins with opt-in effects at zero. Omit them
            // until the user moves the slider, preserving legacy recipe output.
            if (value > 0 || !catalogue().addons.get(id)?.manualOnly) {
                addons[id] = Math.min(100, value);
            }
        }
    }
    const level = typeof p.level === "number" ? checkedLevel(p.level) : undefined;
    return {
        ...(level === undefined ? { strength: layer.strength } : { level }),
        identityLock: flag("identity_lock") ?? true,
        guard: flag("guard"),
        protectSkin: flag("protect"),
        backgroundOnly: flag("background"),
        preset: typeof p.preset === "string" && p.preset ? p.preset : null,
        addons,
    };
}
/** Put a 0.1-step decimal level in the layer. The shell re-renders when its
 * revision changes; the same parameters work for thumbnail, preview and export. */
export function withFilterLevel(layer, level) {
    const valid = checkedLevel(level);
    const lock = layer.parameters.identity_lock;
    return { ...layer, strength: toPercent(valid), parameters: { ...layer.parameters, level: valid,
            identity_lock: typeof lock === "boolean" ? lock : true } };
}
/** Read a level from an existing filter layer without mutating old recipes. */
export function filterLevel(layer) {
    const value = layer.parameters.level;
    return typeof value === "number" ? checkedLevel(value) : fromPercent(layer.strength);
}
// Masks and mesh coordinates remain memory-only, with a strict bounded cache.
// A source larger than this cap can be rendered but is not retained globally.
export const MASK_MEMO_MAX_BYTES = 8 * 1024 * 1024;
const MASK_MEMO_MAX_ENTRIES = 16;
const maskMemo = new Map();
let maskMemoBytes = 0;
export function maskMemoUsage() {
    return { entries: maskMemo.size, bytes: maskMemoBytes };
}
/** Caller must invoke this when the local photo or editor session is reset. */
export function clearFilterMaskCache() {
    maskMemo.clear();
    maskMemoBytes = 0;
}
/** Drop one source without evicting other active photos. */
export function dropFilterMaskSource(sourceId) {
    let removed = 0;
    for (const [key, entry] of maskMemo) {
        if (key.startsWith(`${encodeURIComponent(sourceId)}|`)) {
            maskMemo.delete(key);
            maskMemoBytes -= entry.bytes;
            removed++;
        }
    }
    return removed;
}
/** Compare every mesh coordinate, not just its array identity or photo ID.
 * A landmark correction may change an existing Point2 array in place. */
function faceUnchanged(face, frozen) {
    if (!face)
        return frozen === null;
    if (!frozen || frozen.length !== face.length * 2)
        return false;
    for (let index = 0; index < face.length; index++) {
        if (face[index][0] !== frozen[index * 2] || face[index][1] !== frozen[index * 2 + 1])
            return false;
    }
    return true;
}
function snapshotFace(face) {
    if (!face)
        return null;
    const out = new Float64Array(face.length * 2);
    for (let index = 0; index < face.length; index++) {
        out[index * 2] = face[index][0];
        out[index * 2 + 1] = face[index][1];
    }
    return out;
}
/** Do not trust the person-mask object identity: brush changes can mutate its
 * alpha buffer in place while retaining the same source ID and revision. */
function personUnchanged(person, cached) {
    if (person !== cached.person)
        return false;
    if (!person)
        return cached.personPixels === null && cached.personSize === null;
    const saved = cached.personPixels;
    const dims = cached.personSize;
    if (!saved || !dims || person.data.length !== saved.length ||
        person.width !== dims[0] || person.height !== dims[1] || person.channels !== dims[2])
        return false;
    for (let index = 0; index < saved.length; index++) {
        if (!Object.is(person.data[index], saved[index]))
            return false;
    }
    return true;
}
function snapshotPerson(person) {
    if (!person)
        return null;
    return person.data instanceof Float64Array
        ? Float64Array.from(person.data) : Float32Array.from(person.data);
}
/** Masks are never reused across geometry revisions or changed mesh points.
 * Only face coordinates and masks are retained, never source photo bytes. */
export function masksFor(source) {
    const { width, height } = source.image;
    const key = `${encodeURIComponent(source.id)}|${width}x${height}|${source.geometryRevision ?? 0}`;
    const cached = maskMemo.get(key);
    if (cached && personUnchanged(source.person, cached) && faceUnchanged(source.face, cached.facePoints)) {
        maskMemo.delete(key);
        maskMemo.set(key, cached);
        return cached.masks;
    }
    if (cached) {
        maskMemoBytes -= cached.bytes;
        maskMemo.delete(key);
    }
    const masks = source.face && source.face.length >= 468 ? fromLandmarks(source.face, width, height)
        : source.person ? fromPerson(source.person) : NO_MASKS;
    // Estimate first. For a 12 MP face the masks alone can exceed the memo
    // budget, so avoid allocating an otherwise unused second person-mask copy.
    const bytes = (masks.skin?.data.byteLength ?? 0) +
        (masks.person?.data.byteLength ?? 0) +
        (source.face?.length ?? 0) * 2 * Float64Array.BYTES_PER_ELEMENT +
        (source.person?.data.byteLength ?? 0);
    if (bytes > MASK_MEMO_MAX_BYTES)
        return masks;
    const facePoints = snapshotFace(source.face);
    const personPixels = snapshotPerson(source.person);
    const personSize = source.person
        ? [source.person.width, source.person.height, source.person.channels] : null;
    maskMemo.set(key, { masks, facePoints, person: source.person, personPixels, personSize, bytes });
    maskMemoBytes += bytes;
    while (maskMemo.size > MASK_MEMO_MAX_ENTRIES || maskMemoBytes > MASK_MEMO_MAX_BYTES) {
        const oldest = maskMemo.keys().next().value;
        const entry = maskMemo.get(oldest);
        if (!entry)
            throw new Error("inconsistent filter mask cache state");
        maskMemoBytes -= entry.bytes;
        maskMemo.delete(oldest);
    }
    return masks;
}
export function faceCentreFor(masks) {
    return masks.source === "landmarks" && masks.person ? maskCentre(masks.person) : null;
}
/** Render a filter layer on the current preview (the shell's applyLocalLayer calls this). */
export function applyFilterLayer(img, source, layer) {
    const recipe = recipeFor(layer);
    const masks = masksFor(source);
    const result = render(img, recipe, settingsFor(layer), masks, faceCentreFor(masks));
    const image = { width: result.image.width, height: result.image.height, channels: 3, data: result.image.data };
    return { image, label: `Look · ${recipe.name}`, metrics: { recipe: recipe.id, look: recipe.name, strength_used: result.plan.strength,
            guard: result.plan.guard && masks.skin !== null, fallback: result.plan.fallback, masks: masks.source,
            notes: result.notes.join(" ") } };
}
/** Every look in strip order (§2.22 rank), with the parameters one tap gives. */
export function filterOptions() {
    return catalogue().recipes.map((r) => ({ id: `filters:recipe:${r.id}`, recipe: r.id, label: r.name, description: r.description,
        tab: r.tab, rank: r.rank, params: defaultFilterParams(r.id), strength: r.defaults.strength }));
}
export const THUMBS = new ThumbCache();
/** Use only a stamp computed from these pixels in the current synchronous batch. */
function renderStampedTile(small, option, stamp, cache, safeCopy = false) {
    const key = thumbKey({ source: small.id, revision: small.geometryRevision ?? 0,
        snapshot: stamp, recipe: option.recipe, strength: option.strength,
        side: Math.max(small.image.width, small.image.height),
        params: option.params });
    const hit = safeCopy ? cache.getCopy(key) : cache.get(key);
    if (hit)
        return hit;
    const layer = { parameters: option.params, strength: option.strength };
    const out = applyFilterLayer(small.image, small, { ...layer, id: "thumb-filters", kind: "filters", name: "Filters", enabled: true,
        opacity: 1, provenance: "local", simulation: false, origin: small.kind === "sample" ? "sample" : "photo" }).image;
    if (safeCopy)
        cache.setCopy(key, out);
    else
        cache.set(key, out);
    return out;
}
/** Single-tile compatibility API: always re-check current source bytes. */
export function renderFilterTile(small, option, cache = THUMBS) {
    return renderStampedTile(small, option, thumbSourceStamp(small), cache);
}
/** Page-at-a-time filter rendering. Source bytes are hashed only once per page.
 * The result is fully synchronous; the caller decides when to request the next
 * page. No hidden tasks survive a change of photo or editor session. */
export function renderFilterBatch(small, options, page = 0, size = 12, cache = THUMBS) {
    if (!(Number.isSafeInteger(page) && page >= 0))
        throw new RangeError("filter page must be non-negative");
    if (!(Number.isSafeInteger(size) && size >= 1 && size <= 61))
        throw new RangeError("filter page size must be 1-61");
    const pages = Math.max(1, Math.ceil(options.length / size));
    if (page >= pages)
        throw new RangeError("filter page exceeds catalogue");
    const visible = options.slice(page * size, (page + 1) * size);
    if (!visible.length)
        return [];
    const stamp = thumbSourceStamp(small);
    return visible.map((option) => renderStampedTile(small, option, stamp, cache, true));
}
//# sourceMappingURL=layer.js.map