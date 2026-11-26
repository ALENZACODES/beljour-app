/**
 * Render one filter on one photo in the browser: plan, bake, look, guard, keep.
 * The same pipeline, rules and notes as api/plumb_api/filters/engine.py:
 *
 *   plan   recipe + slider + toggles + preset + add-ons -> stages at this strength
 *   bake   colour stages fused into one 33^3 LUT (LRU cache by the plan's key)
 *   look   LUT (tetrahedral) -> spatial (glow) -> light (vignette, centre, grade) -> bytes
 *   guard  skin guard inside the skin mask, against the look of a mid-grey photo
 *   keep   Protect skin and Background only restore original pixels
 *
 * Strength 0 with no add-on returns the photo unchanged, byte for byte. With no skin mask
 * the look runs at a capped 30 without skin-hue steps (noted). Strength recomputes the
 * recipe and re-bakes; it never cross-fades (plan M8).
 * Author: John Khan.
 */
import { requireColour } from "../../engines/core/buffer.js";
import { OPS, isNeutral, op, scaleFraction, scaleParams, withoutSkinHue, runOp, photoCast } from "../colour/ops.js";
import * as LUT from "../colour/lut.js";
import { MID_GREY_BYTE, clamp01 } from "../colour/space.js";
import { guard as skinGuard, greyRise } from "../masks/guard.js";
import { clampHue, faceMask } from "../masks/hue-lock.js";
import { NO_MASKS, keepMask, keepOriginal, validateFilterMasks } from "../masks/blend.js";
import { catalogue } from "../recipe/registry.js";
import "../spatial/glow.js";
import "../spatial/grain.js";
import "../light/position.js";
import "../light/border.js";
import "../spatial/halation.js";
import "../spatial/structure.js";
import { toPercent } from "./strength.js";
export const FALLBACK_STRENGTH = 30;
export const FAMILY_ORDER = ["colour", "spatial", "light"];
export class FilterUnavailable extends Error {
}
function canonical(value) {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
    }
    return value;
}
/** FNV-1a over the canonical JSON of the colour stages, two 32-bit lanes, as hex. */
export function planKey(p) {
    const text = JSON.stringify(p.stages.filter((s) => s.family === "colour").map((s) => [s.op, canonical(s.params)]));
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ text.length;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    }
    return `${p.recipe}@${p.version}:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
function presetOf(recipe, name) {
    if (!name)
        return null;
    const found = (recipe.presets ?? []).find((p) => p.name === name);
    if (!found)
        throw new RangeError(`${recipe.id} has no preset ${JSON.stringify(name)}`);
    return found;
}
export function plan(recipe, settings = {}, hasSkin = false, addonTable = catalogue().addons, stats = {}) {
    const d = recipe.defaults;
    if (settings.level !== undefined && settings.strength !== undefined)
        throw new RangeError("choose level or legacy strength, not both");
    let strength = settings.level === undefined ? settings.strength ?? d.strength : toPercent(settings.level);
    if (!(Number.isFinite(strength) && strength >= 0 && strength <= 100))
        throw new RangeError("strength must be 0-100");
    strength = Math.min(strength, recipe.limits.strengthMax ?? 100);
    const guardOn = settings.guard ?? d.guard, protectSkin = settings.protectSkin ?? d.protectSkin;
    const backgroundOnly = settings.backgroundOnly ?? d.backgroundOnly;
    const notes = [], pending = [];
    const fallback = guardOn && !hasSkin && strength > 0;
    if (fallback) {
        if (strength > FALLBACK_STRENGTH) {
            notes.push(`No skin outline for this photo, so the look is capped at ${FALLBACK_STRENGTH}.`);
            strength = FALLBACK_STRENGTH;
        }
        notes.push("No skin outline: steps that could turn skin hue are left out.");
    }
    const preset = presetOf(recipe, settings.preset);
    const raw = recipe.stages.map((s) => ({ ...s }));
    if (preset) {
        for (const s of raw) {
            const patch = s.id ? preset.patch?.[s.id] : undefined;
            if (patch)
                s.params = { ...(s.params ?? {}), ...patch };
        }
        raw.push(...(preset.append ?? []).map((s) => ({ ...s })));
        pending.push(...(preset.pending ?? []));
    }
    const s = strength / 100;
    let stages = raw.map((item) => {
        const spec = op(item.op);
        return { op: spec.name, family: spec.family, params: scaleParams(spec, item.params ?? {}, scaleFraction(item.scale ?? "linear", s)) };
    });
    const amounts = {};
    for (const a of d.addons ?? [])
        amounts[a.id] = a.amount;
    for (const [k, v] of Object.entries(settings.addons ?? {}))
        amounts[k] = v;
    for (const [id, amount] of Object.entries(amounts)) {
        const entry = addonTable.get(id);
        if (!entry)
            throw new RangeError(`unknown add-on ${JSON.stringify(id)}`);
        if (!(amount >= 0 && amount <= 100))
            throw new RangeError("add-on amounts are 0-100");
        if (amount <= 0)
            continue;
        if (entry.manualOnly && !Object.hasOwn(settings.addons ?? {}, id)) {
            pending.push(`${(entry.label ?? id).toLowerCase()} ${entry.round}`);
            continue;
        }
        if (!entry.built || !entry.stage) {
            pending.push(`${(entry.label ?? id).toLowerCase()} ${entry.round}`);
            continue;
        }
        const spec = op(entry.stage.op);
        stages.push({ op: spec.name, family: spec.family, params: scaleParams(spec, entry.stage.params ?? {}, amount / 100) });
    }
    if (fallback) {
        const kept = [];
        for (const st of stages) {
            const p = withoutSkinHue(st.op, st.params);
            if (p)
                kept.push({ ...st, params: p });
        }
        stages = kept;
    }
    stages = stages.map((st) => op(st.op).stats === "cast" ? { ...st, params: { ...st.params, castA: stats.castA ?? 0, castB: stats.castB ?? 0 } } : st);
    const builtAddonOn = Object.entries(amounts).some(([k, v]) => v > 0 && addonTable.get(k)?.built &&
        (!addonTable.get(k)?.manualOnly || Object.hasOwn(settings.addons ?? {}, k)));
    stages = stages.filter((st) => !isNeutral(st.op, st.params));
    const order = (f) => FAMILY_ORDER.indexOf(f);
    const ordered = stages.map((st, i) => ({ st, i })).sort((a, b) => order(a.st.family) - order(b.st.family) ||
        Number(a.st.op === "spatial.grain") - Number(b.st.op === "spatial.grain") ||
        a.i - b.i).map((x) => x.st);
    return { recipe: recipe.id, version: recipe.version, strength, stages: ordered, guard: guardOn,
        guardMode: recipe.limits.guardMode ?? "full", protectSkin, backgroundOnly, fallback,
        identity: strength <= 0 && !builtAddonOn, identityLock: settings.identityLock ?? true, pending, notes };
}
export const needsCast = (recipe) => recipe.stages.some((s) => OPS.get(s.op)?.stats === "cast");
export function colourTransform(stages) {
    const colour = stages.filter((s) => s.family === "colour");
    return (rgb) => { for (const st of colour)
        runOp(st.op, rgb, st.params); };
}
/** Baked LUTs by plan key, least recently used dropped first. */
export class LutCache {
    limit;
    items = new Map();
    bakes = 0;
    constructor(limit = 32) {
        this.limit = limit;
    }
    get(p) {
        const key = planKey(p);
        const hit = this.items.get(key);
        if (hit) {
            this.items.delete(key);
            this.items.set(key, hit);
            return hit;
        }
        const table = LUT.bake(colourTransform(p.stages));
        this.bakes++;
        this.items.set(key, table);
        while (this.items.size > this.limit)
            this.items.delete(this.items.keys().next().value);
        return table;
    }
    get size() { return this.items.size; }
    clear() { this.items.clear(); }
}
export const LUTS = new LutCache(24);
export function wholeFrame(width, height, faceCentre = null) {
    return { width, height, x0: 0, y0: 0, faceCentre };
}
/** The look on a block of RGB bytes (before masks): LUT, spatial, light; rounded to bytes. */
export function look(rgb, width, height, p, frame, cache = LUTS) {
    let block = { width, height, data: LUT.applyBytes(cache.get(p), rgb, 3) };
    for (const family of ["spatial", "light"]) {
        for (const st of p.stages) {
            if (st.family !== family)
                continue;
            block = op(st.op).image(block, st.params, frame);
            for (let i = 0; i < block.data.length; i++)
                block.data[i] = clamp01(block.data[i]);
        }
    }
    return LUT.toBytes(block.data);
}
/** Pixels a tile needs around it for this plan's spatial stages. */
export function halo(p, frame) {
    let h = 0;
    for (const st of p.stages) {
        const fn = OPS.get(st.op)?.halo;
        if (fn)
            h += fn(st.params, frame);
    }
    return h;
}
export const greyPhoto = (pixels) => new Uint8Array(pixels * 3).fill(MID_GREY_BYTE);
export function rgbOf(image) {
    requireColour(image);
    if (image.channels === 3)
        return { width: image.width, height: image.height, data: Uint8Array.from(image.data) };
    const out = new Uint8Array(image.width * image.height * 3);
    for (let p = 0; p < image.width * image.height; p++) {
        out[p * 3] = image.data[p * 4];
        out[p * 3 + 1] = image.data[p * 4 + 1];
        out[p * 3 + 2] = image.data[p * 4 + 2];
    }
    return { width: image.width, height: image.height, data: out };
}
export function recipeOf(recipe) {
    return typeof recipe === "string" ? catalogue().get(recipe) : recipe;
}
/** Plan with the photo statistics this recipe needs, and the notes about masks. */
export function prepare(img, recipe, settings, masks) {
    const stats = {};
    if (needsCast(recipe)) {
        const [a, b] = photoCast(img.data, 255);
        stats.castA = a;
        stats.castB = b;
    }
    const p = plan(recipe, settings, masks.skin !== null, catalogue().addons, stats);
    const notes = [...p.notes];
    if (p.backgroundOnly && !masks.person)
        throw new FilterUnavailable("Background only needs a person outline for this photo. Turn it off, or add a face first.");
    if (p.backgroundOnly && masks.source === "landmarks" && masks.note)
        notes.push(masks.note);
    if (p.protectSkin && !masks.skin)
        notes.push("Protect skin needs a skin outline; this photo has none, so it can't be applied.");
    notes.push(...p.pending.map((item) => `Not built yet: ${item}.`));
    return { plan: p, notes };
}
/** The guard and keep steps on already-looked bytes (shared by the whole and the tiled render). */
export function finish(before, styled, greyLook, p, masks, pixels, stats = null, checkedHue = null) {
    // checkedHue may only come from the tile runner's mandatory whole-frame
    // clamp. The public render path always runs the hue check itself.
    if (checkedHue && checkedHue.length !== before.length) {
        throw new RangeError("prepared hue pixels must match the tile dimensions");
    }
    let out = checkedHue ?? (p.stages.some((s) => s.family === "colour")
        ? clampHue(before, styled, faceMask(masks)) : styled);
    if (p.guard && masks.skin && greyLook)
        out = skinGuard(before, out, masks.skin, greyRise(greyLook), p.guardMode, stats);
    return keepOriginal(before, out, keepMask(masks, p.protectSkin, p.backgroundOnly, pixels));
}
export function render(image, recipe, settings = {}, masks = NO_MASKS, faceCentre = null, cache = LUTS) {
    const img = rgbOf(image), rec = recipeOf(recipe);
    validateFilterMasks(masks, img.width, img.height);
    const { plan: p, notes } = prepare(img, rec, settings, masks);
    if (p.identity)
        return { image: img, look: { ...img, data: Uint8Array.from(img.data) }, plan: p, notes };
    const frame = wholeFrame(img.width, img.height, faceCentre);
    const styled = look(img.data, img.width, img.height, p, frame, cache);
    const pixels = img.width * img.height;
    const greyLook = p.guard && masks.skin ? look(greyPhoto(pixels), img.width, img.height, p, frame, cache) : null;
    const out = finish(img.data, styled, greyLook, p, masks, pixels);
    return { image: { ...img, data: out }, look: { ...img, data: styled }, plan: p, notes };
}
//# sourceMappingURL=engine.js.map