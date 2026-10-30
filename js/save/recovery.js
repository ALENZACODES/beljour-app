/** Small, versioned settings recovery for this tab. No image, mask, face geometry,
 * filename or provider response can enter the persisted envelope. Author: John Khan. */
import { RECIPE_FORMAT, MAX_STEPS } from "./recipe.js";
import { validateRecipe } from "./validate.js";
export const RECOVERY_KEY = "beljour.recipe-recovery.v2";
export const RECOVERY_FORMAT = "beljour-recovery/2";
export const RECOVERY_MAX_BYTES = 64 * 1024;
export const RECOVERY_TTL_MS = 12 * 60 * 60 * 1000;
function record(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid recovery");
    return value;
}
function keys(value, allowed) {
    if (Object.keys(value).some((key) => !allowed.includes(key)))
        throw new Error("Unexpected recovery data");
}
function cleanDraft(value) {
    const input = record(value);
    keys(input, ["recipe", "layers"]);
    const recipe = validateRecipe(input.recipe);
    // A draft describes only the current editing state, never a library history.
    if (recipe.versions.length !== 1)
        throw new Error("A recovery has one version");
    if (!Array.isArray(input.layers) || input.layers.length !== recipe.versions[0].steps.length)
        throw new Error("Layer count differs");
    const layers = input.layers.map((value) => {
        const layer = record(value);
        keys(layer, ["enabled", "opacity"]);
        if (typeof layer.enabled !== "boolean" || typeof layer.opacity !== "number" ||
            !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)
            throw new Error("Invalid layer setting");
        return { enabled: layer.enabled, opacity: layer.opacity };
    });
    if (recipe.versions[0].steps.some((step) => step.provider !== "local"))
        throw new Error("Live layers need a fresh request");
    return { recipe, layers };
}
/** Exported construction accepts settings, not an Editor, to prevent accidental photo capture. */
export function recoveryDraft(steps, layers) {
    if (steps.length < 1 || steps.length > MAX_STEPS)
        throw new Error("Recovery needs 1 to 16 steps");
    const created = new Date(0).toISOString();
    return cleanDraft({ recipe: { format: RECIPE_FORMAT, id: "look-00000000", name: "Unsaved look", created,
            versions: [{ version: 1, created, steps }] }, layers });
}
export class RecipeRecovery {
    storage;
    clock;
    previous = "";
    constructor(storage, clock = Date.now) {
        this.storage = storage;
        this.clock = clock;
    }
    save(draft) {
        if (!this.storage)
            return "unavailable";
        let clean;
        try {
            clean = cleanDraft(draft);
        }
        catch {
            return "invalid";
        }
        const body = JSON.stringify(clean);
        if (body === this.previous) {
            try {
                if (this.storage.getItem(RECOVERY_KEY) !== null)
                    return "unchanged";
            }
            catch {
                return "unavailable";
            }
        }
        const savedAt = this.clock();
        if (!Number.isFinite(savedAt) || savedAt < 0)
            return "invalid";
        const text = JSON.stringify({ format: RECOVERY_FORMAT, savedAt, draft: clean });
        if (new TextEncoder().encode(text).length > RECOVERY_MAX_BYTES)
            return "invalid";
        try {
            this.storage.setItem(RECOVERY_KEY, text);
            this.previous = body;
            return "saved";
        }
        catch {
            return "unavailable";
        }
    }
    read() {
        if (!this.storage)
            return { status: "unavailable" };
        let text;
        try {
            text = this.storage.getItem(RECOVERY_KEY);
        }
        catch {
            return { status: "unavailable" };
        }
        if (text === null)
            return { status: "empty" };
        try {
            if (new TextEncoder().encode(text).length > RECOVERY_MAX_BYTES)
                throw new Error("Recovery too large");
            const envelope = record(JSON.parse(text));
            keys(envelope, ["format", "savedAt", "draft"]);
            if (envelope.format !== RECOVERY_FORMAT || typeof envelope.savedAt !== "number" ||
                !Number.isFinite(envelope.savedAt) || envelope.savedAt < 0)
                throw new Error("Unknown recovery version");
            const now = this.clock();
            if (!Number.isFinite(now) || envelope.savedAt > now + 60_000 || now - envelope.savedAt > RECOVERY_TTL_MS) {
                this.clear();
                return { status: "expired" };
            }
            return { status: "ready", draft: cleanDraft(envelope.draft), savedAt: envelope.savedAt };
        }
        catch {
            this.clear();
            return { status: "invalid" };
        }
    }
    clear() {
        this.previous = "";
        try {
            this.storage?.removeItem(RECOVERY_KEY);
            return this.storage !== null;
        }
        catch {
            return false;
        }
    }
}
export function browserRecovery() {
    let storage = null;
    try {
        storage = globalThis.sessionStorage ?? null;
    }
    catch { /* private mode can deny the getter */ }
    return new RecipeRecovery(storage);
}
//# sourceMappingURL=recovery.js.map