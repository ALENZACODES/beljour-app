import { MAX_VERSIONS, RECIPE_FORMAT, TOOLS, autoName, cloneLook, cloneSteps, hashId, latest, version, } from "./recipe.js";
import { RecipeError, validateRecipe, validateStep } from "./validate.js";
export class LookLibrary {
    storage;
    clock;
    constructor(storage, clock = () => new Date()) {
        this.storage = storage;
        this.clock = clock;
    }
    async saveLook(name, steps) {
        const clean = steps.map((s, i) => validateStep(s, `steps[${i}]`));
        if (!clean.length)
            throw new RecipeError("steps", "add an edit first, then save it as a look");
        const created = this.clock().toISOString();
        const finalName = (name ?? "").trim() || autoName(clean);
        const id = "look-" + hashId(finalName + created + JSON.stringify(clean));
        const look = validateRecipe({ format: RECIPE_FORMAT, id, name: finalName, created, versions: [{ version: 1, created, steps: clean }] });
        await this.storage.put(look);
        return cloneLook(look);
    }
    /** Re-save after more edits: a new version is appended, older ones stay exactly as they were. */
    async updateLook(id, steps) {
        const look = await this.storage.get(id);
        if (!look)
            throw new RecipeError("look", "is not saved in this browser");
        if (look.versions.length >= MAX_VERSIONS)
            throw new RecipeError("look", `keeps at most ${MAX_VERSIONS} versions; save it as a new look`);
        const clean = steps.map((s, i) => validateStep(s, `steps[${i}]`));
        if (!clean.length)
            throw new RecipeError("steps", "a version needs at least one edit");
        const next = { version: look.versions.length + 1, created: this.clock().toISOString(), steps: clean };
        const updated = validateRecipe({ ...look, versions: [...look.versions, next] });
        await this.storage.put(updated);
        return cloneLook(updated);
    }
    async rename(id, name) {
        const look = await this.storage.get(id);
        if (!look)
            throw new RecipeError("look", "is not saved in this browser");
        const updated = validateRecipe({ ...look, name });
        await this.storage.put(updated);
        return updated;
    }
    get(id) { return this.storage.get(id); }
    list() { return this.storage.list(); }
    remove(id) { return this.storage.delete(id); }
}
export function copyPhoto(photo) {
    return { width: photo.width, height: photo.height, channels: photo.channels, data: new Uint8Array(photo.data) };
}
/** Apply one version (default: the newest) to a copy of the photo. `dose` scales strength per face. */
export function applyLook(look, photo, engine, options = {}) {
    const chosen = options.version === undefined ? latest(look) : version(look, options.version);
    const dose = options.dose ?? 1;
    if (!(Number.isFinite(dose) && dose >= 0 && dose <= 1))
        throw new RangeError("dose must be 0 to 1");
    let current = copyPhoto(photo);
    const applied = [], skipped = [];
    for (const step of cloneSteps(chosen.steps)) {
        if (step.provider === "youcam" && !options.youcamAvailable) {
            skipped.push({ tool: step.tool, reason: `${TOOLS[step.tool].label} needs YouCam, which is off; the rest of the look was applied.` });
            continue;
        }
        const fn = engine[step.tool];
        if (!fn) {
            skipped.push({ tool: step.tool, reason: `${TOOLS[step.tool]?.label ?? step.tool} isn't available on this device yet.` });
            continue;
        }
        const out = fn(current, step, dose);
        if (out.width !== current.width || out.height !== current.height || out.channels !== current.channels) {
            throw new RangeError(`${step.tool} changed the photo size`);
        }
        current = out;
        applied.push(step.tool);
    }
    return { photo: current, applied, skipped };
}
export const OFFER_KEY = "beljour.save-offer";
export const OFFER_TEXT = "Save this as a Look to reuse it?";
/** The one-time offer after saving a single photo without a look. */
export class SaveOffer {
    store;
    constructor(store) {
        this.store = store;
    }
    /** True only if she saved a photo with edits, has no look for it, and was never asked. */
    shouldOffer(context) {
        if (!context.savedPhoto || !context.hasEdits || context.savedAsLook)
            return false;
        try {
            return this.store.getItem(OFFER_KEY) === null;
        }
        catch {
            return false;
        }
    }
    answer(choice) {
        try {
            this.store.setItem(OFFER_KEY, choice);
        }
        catch { /* the offer may show again next visit */ }
    }
}
