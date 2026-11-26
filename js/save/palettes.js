/** W1 preference storage. Palettes contain names, roles and six-digit colour
 * codes only. Never images, face measurements, filenames or URLs. Explicit saves
 * survive unavailable storage in memory with a visible outcome. Author: John Khan.
 */
import { fingerprint } from "../layout/my-looks.js";
import { hexToRgb, rgbToHex } from "../engines/core/colour.js";
export const PALETTE_FORMAT = "beljour-palette/1", PALETTE_KEY = "beljour.palettes.v1";
export const PALETTE_ROLES = ["eyes", "blush", "lips"];
export const MAX_PALETTES = 24, MAX_SWATCHES = 18, MAX_PALETTE_FILE = 64 * 1024;
function object(raw, allowed, label) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error(`${label} must be an object.`);
    const out = raw;
    if (Object.keys(out).some(key => !allowed.includes(key)))
        throw new Error(`${label} contains unexpected fields.`);
    return out;
}
function name(raw, label) {
    if (typeof raw !== "string" || raw.trim().length < 1 || raw.length > 40 || /[\u0000-\u001f\u007f]/.test(raw) || /^(?:data:|blob:|https?:)/i.test(raw)) {
        throw new Error(`${label} needs 1 to 40 plain text characters.`);
    }
    return raw.trim();
}
export function validateSwatch(raw) {
    const value = object(raw, ["id", "name", "hex", "role"], "Swatch");
    if (typeof value.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(value.id))
        throw new Error("Swatch ID is invalid.");
    if (typeof value.hex !== "string" || !/^#[0-9a-f]{6}$/i.test(value.hex))
        throw new Error("Choose a six-digit colour code.");
    if (!PALETTE_ROLES.includes(value.role))
        throw new Error("Choose Eyes, Blush or Lips for every swatch.");
    return { id: value.id, name: name(value.name, "Swatch name"), hex: rgbToHex(hexToRgb(value.hex)), role: value.role };
}
export function validatePalette(raw) {
    const value = object(raw, ["format", "id", "name", "created", "swatches"], "Palette");
    if (value.format !== PALETTE_FORMAT || typeof value.id !== "string" || !/^palette-[a-f0-9]{8}$/.test(value.id))
        throw new Error("Unsupported palette file.");
    if (typeof value.created !== "string" || !Number.isFinite(Date.parse(value.created)))
        throw new Error("Palette date is invalid.");
    if (!Array.isArray(value.swatches) || value.swatches.length < 1 || value.swatches.length > MAX_SWATCHES)
        throw new Error(`A palette holds 1 to ${MAX_SWATCHES} swatches.`);
    const swatches = value.swatches.map(validateSwatch);
    if (new Set(swatches.map(swatch => swatch.id)).size !== swatches.length)
        throw new Error("Swatch IDs must be unique.");
    return { format: PALETTE_FORMAT, id: value.id, name: name(value.name, "Palette name"),
        created: new Date(value.created).toISOString(), swatches };
}
export function paletteText(palette) { return JSON.stringify(validatePalette(palette), null, 2) + "\n"; }
export function parsePalette(text) {
    if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_PALETTE_FILE)
        throw new Error("Palette file is too large.");
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        throw new Error("This is not a palette JSON file.");
    }
    return validatePalette(value);
}
const copy = (palette) => ({ ...palette, swatches: palette.swatches.map(swatch => ({ ...swatch })) });
export class PaletteLibrary {
    storage;
    clock;
    items = [];
    counter = 0;
    storageNote = "";
    constructor(storage, clock = () => new Date()) {
        this.storage = storage;
        this.clock = clock;
        try {
            const stored = storage?.getItem(PALETTE_KEY);
            if (stored) {
                if (new TextEncoder().encode(stored).length > MAX_PALETTES * MAX_PALETTE_FILE)
                    throw new Error("Palette storage too large");
                const value = JSON.parse(stored);
                if (!Array.isArray(value) || value.length > MAX_PALETTES)
                    throw new Error("Invalid palette store");
                for (const row of value) {
                    try {
                        this.items.push(validatePalette(row));
                    }
                    catch {
                        this.storageNote = "An invalid saved palette was ignored.";
                    }
                }
                if (new Set(this.items.map(palette => palette.id)).size !== this.items.length)
                    throw new Error("Repeated palette IDs");
            }
        }
        catch {
            this.items = [];
            this.storageNote = "Saved palettes could not be read. New colours can still be kept in this page.";
        }
    }
    get note() { return this.storageNote; }
    list() { return this.items.map(copy); }
    get(id) { const item = this.items.find(palette => palette.id === id); return item ? copy(item) : null; }
    persist(removal = false) {
        try {
            if (!this.storage)
                throw new Error("Storage unavailable");
            if (this.items.length)
                this.storage.setItem(PALETTE_KEY, JSON.stringify(this.items));
            else
                this.storage.removeItem(PALETTE_KEY);
            this.storageNote = removal ? "Removed from this device's palette storage." : "Saved colour settings only. No photo or skin measurement was stored.";
            return true;
        }
        catch {
            this.storageNote = removal
                ? "Removed from this page. Device storage could not be updated; the old saved palette may reappear after reload."
                : "Storage is unavailable. This palette is kept only in this page; export its colour file before leaving.";
            return false;
        }
    }
    save(title, swatches, existingId) {
        const prior = existingId ? this.items.find(palette => palette.id === existingId) : undefined;
        if (existingId && !prior)
            throw new Error("This saved palette is no longer available.");
        if (!prior && this.items.length >= MAX_PALETTES)
            throw new Error(`Keep at most ${MAX_PALETTES} palettes. Remove one before adding another.`);
        const created = prior?.created ?? this.clock().toISOString();
        let id = prior?.id ?? "palette-" + fingerprint(title + created + JSON.stringify(swatches) + ++this.counter);
        while (!prior && this.items.some(item => item.id === id))
            id = "palette-" + fingerprint(id + ++this.counter);
        const palette = validatePalette({ format: PALETTE_FORMAT, id, name: title, created, swatches });
        this.items = prior ? this.items.map(item => item.id === prior.id ? palette : item) : [...this.items, palette];
        const stored = this.persist();
        return { palette: copy(palette), stored, note: this.storageNote };
    }
    import(text) {
        const parsed = parsePalette(text);
        // Import as a new local copy. A file cannot silently replace an existing palette.
        return this.save(parsed.name, parsed.swatches);
    }
    remove(id) {
        const before = this.items.length;
        this.items = this.items.filter(item => item.id !== id);
        return { removed: this.items.length !== before, stored: this.persist(true) };
    }
    clear() {
        const removed = this.items.length;
        this.items = [];
        return { removed, stored: this.persist(true) };
    }
}
export function browserPalettes() {
    let storage = null;
    try {
        storage = globalThis.localStorage ?? null;
    }
    catch { /* denied getter: memory-only editor */ }
    return new PaletteLibrary(storage);
}
//# sourceMappingURL=palettes.js.map