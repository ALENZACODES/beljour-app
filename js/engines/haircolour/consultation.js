/** Local W28/W39 hair-colour consultation on a supplied, observed hair mask.
 * A bounded session holds copied input arrays in memory, never in recipes.
 * The guard is a pixel-change proxy, not an identity measurement.
 * All colour examples are simulations. Author: John Khan.
 */
import { paint } from "./balayage.js";
import { recolourHair } from "./recolour.js";
export const SIMULATION_LABEL = "Local colour simulation. A strand test is needed for a physical result.";
export const DEFAULT_LEVEL = 2.0;
export const CACHE_LIMIT = 4;
export const MAX_PIXELS = 16_777_216;
export const MIN_HAIR_PIXELS = 16;
export const SHADE_LAB = {
    deep: [24, 5, 2],
    copper: [53, 37, 34],
    ash: [57, -4, 7],
    chestnut: [42, 17, 19],
    gold: [71, 10, 30],
};
function assertRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RangeError("recipe must be an object");
    }
    return value;
}
export function checkedLevel(input) {
    if (typeof input !== "number" || !Number.isFinite(input) || input < 1 || input > 5) {
        throw new RangeError("level must be within 1.0 to 5.0");
    }
    if (Math.abs(input * 10 - Math.round(input * 10)) > 1e-9) {
        throw new RangeError("level must use 0.1 steps");
    }
    return Math.round(input * 10) / 10;
}
export function levelWeight(value) {
    return (checkedLevel(value) - 1) / 4;
}
export function checkedLock(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError("lock level must be within 0..1");
    }
    return value;
}
export function choice(mode, patch = {}) {
    const next = {
        mode,
        level: patch.level ?? DEFAULT_LEVEL,
        shade: patch.shade ?? "chestnut",
        targetLevel: patch.targetLevel ?? 6,
        baseLevel: patch.baseLevel ?? null,
        history: patch.history ?? "virgin",
        toner: patch.toner ?? "none",
        softness: patch.softness ?? 3,
    };
    checkedLevel(next.level);
    if (next.mode !== "W28" && next.mode !== "W39") {
        throw new RangeError("unsupported colour simulation");
    }
    if (!Object.hasOwn(SHADE_LAB, next.shade)) {
        throw new RangeError("unsupported illustrative shade");
    }
    if (!Number.isInteger(next.targetLevel) || next.targetLevel < 1 || next.targetLevel > 10) {
        throw new RangeError("target level must be an integer 1..10");
    }
    if (next.baseLevel !== null && (!Number.isInteger(next.baseLevel) || next.baseLevel < 1 || next.baseLevel > 10)) {
        throw new RangeError("base level must be an integer 1..10");
    }
    if (!["virgin", "colour_treated", "box_dye"].includes(next.history)) {
        throw new RangeError("unsupported colour history");
    }
    if (!["none", "pearl", "ash", "violet"].includes(next.toner)) {
        throw new RangeError("unsupported toner");
    }
    if (!Number.isInteger(next.softness) || next.softness < 0 || next.softness > 16) {
        throw new RangeError("softness must be an integer 0..16");
    }
    return next;
}
export function safeRecipe(input) {
    const c = choice(input.mode, input);
    return {
        format: "beljour-hair-consultation/1",
        mode: c.mode,
        level: checkedLevel(c.level),
        shade: c.shade,
        target_level: c.targetLevel,
        base_level: c.baseLevel,
        history: c.history,
        toner: c.toner,
        softness: c.softness,
        simulation: "true",
    };
}
export function parseRecipe(input) {
    const r = assertRecord(input);
    const keys = [
        "format", "mode", "level", "shade", "target_level", "base_level",
        "history", "toner", "softness", "simulation",
    ];
    if (Object.keys(r).sort().join("|") !== keys.sort().join("|")) {
        throw new RangeError("unsupported recipe schema");
    }
    if (r.format !== "beljour-hair-consultation/1" || r.simulation !== "true") {
        throw new RangeError("simulation disclosure is required");
    }
    if (r.mode !== "W28" && r.mode !== "W39")
        throw new RangeError("unsupported mode");
    if (typeof r.shade !== "string" || !Object.hasOwn(SHADE_LAB, r.shade)) {
        throw new RangeError("unsupported shade");
    }
    if (r.history !== "virgin" && r.history !== "colour_treated" && r.history !== "box_dye") {
        throw new RangeError("unsupported colour history");
    }
    if (!["none", "pearl", "ash", "violet"].includes(String(r.toner))) {
        throw new RangeError("unsupported toner");
    }
    if (typeof r.target_level !== "number" ||
        (r.base_level !== null && typeof r.base_level !== "number") ||
        typeof r.softness !== "number") {
        throw new RangeError("invalid numerical recipe field");
    }
    return choice(r.mode, {
        level: checkedLevel(r.level),
        shade: r.shade,
        targetLevel: r.target_level,
        baseLevel: r.base_level,
        history: r.history,
        toner: r.toner,
        softness: r.softness,
    });
}
/** Half-even rounding matches NumPy rint on linear combinations of byte inputs. */
export function byteRound(value) {
    if (value <= 0)
        return 0;
    if (value >= 255)
        return 255;
    const integer = Math.floor(value);
    const fraction = value - integer;
    if (Math.abs(fraction - 0.5) <= 1e-10) {
        return integer % 2 === 0 ? integer : integer + 1;
    }
    return fraction < 0.5 ? integer : integer + 1;
}
export class LocalChangeGuard {
    channels;
    constructor(channels = 3) {
        this.channels = channels;
    }
    guard(before, candidate, lockLevel) {
        const lock = checkedLock(lockLevel);
        if (before.length !== candidate.length || before.length % this.channels !== 0) {
            throw new RangeError("identity guard frame mismatch");
        }
        let distance = 0;
        for (let i = 0; i < before.length; i += this.channels) {
            for (let channel = 0; channel < 3; channel++) {
                distance += Math.abs(before[i + channel] - candidate[i + channel]);
            }
        }
        distance /= before.length / this.channels * 3;
        const budget = 9 + 65 * (1 - lock);
        const ratio = Math.min(1, budget / Math.max(distance, 1e-9));
        const result = Uint8ClampedArray.from(before);
        for (let i = 0; i < before.length; i += this.channels) {
            for (let channel = 0; channel < 3; channel++) {
                const offset = i + channel;
                result[offset] = byteRound(before[offset] + ratio * (candidate[offset] - before[offset]));
            }
        }
        return { image: result, similarity: Math.max(0, 1 - distance / 255), limited: ratio < 1 };
    }
}
function checkImage(image) {
    if (image.channels !== 3 && image.channels !== 4) {
        throw new RangeError("source must be RGB or RGBA");
    }
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height)) {
        throw new RangeError("source dimensions must be integers");
    }
    if (Math.min(image.width, image.height) < 2 || image.width * image.height > MAX_PIXELS) {
        throw new RangeError("source dimensions out of range");
    }
    if (image.data.length !== image.width * image.height * image.channels) {
        throw new RangeError("source data length mismatch");
    }
    for (let i = 0; i < image.data.length; i++) {
        const v = image.data[i];
        if (!Number.isInteger(v) || v < 0 || v > 255)
            throw new RangeError("source must contain bytes");
    }
    return Uint8ClampedArray.from(image.data);
}
function checkPlane(values, length, label) {
    if (values.length !== length)
        throw new RangeError(`${label} must match the photo`);
    const out = new Float64Array(length);
    for (let i = 0; i < length; i++) {
        if (!(values[i] >= 0 && values[i] <= 1)) {
            throw new RangeError(`${label} must contain finite fractions in 0..1`);
        }
        out[i] = values[i];
    }
    return out;
}
function nearestPreview(pixels, width, height, channels, maxEdge) {
    if (maxEdge === undefined || Math.max(width, height) <= maxEdge) {
        return { data: Uint8ClampedArray.from(pixels), width, height, preview: false };
    }
    const scale = maxEdge / Math.max(width, height);
    const nh = Math.max(1, Math.round(height * scale));
    const nw = Math.max(1, Math.round(width * scale));
    const out = new Uint8ClampedArray(nw * nh * channels);
    for (let y = 0; y < nh; y++) {
        const sy = Math.min(height - 1, Math.floor((y + 0.5) / scale));
        for (let x = 0; x < nw; x++) {
            const sx = Math.min(width - 1, Math.floor((x + 0.5) / scale));
            for (let c = 0; c < channels; c++) {
                out[(y * nw + x) * channels + c] = pixels[(sy * width + sx) * channels + c];
            }
        }
    }
    return { data: out, width: nw, height: nh, preview: true };
}
export class HairColourSession {
    source;
    mask;
    primary;
    width;
    height;
    channels;
    limit;
    effectCache = [];
    levels = {};
    masksPrepared = 1;
    effectsPrepared = 0;
    guardsRun = 0;
    constructor(image, hairMask, options = {}) {
        this.source = checkImage(image);
        this.width = image.width;
        this.height = image.height;
        this.channels = image.channels;
        const n = this.width * this.height;
        this.mask = checkPlane(hairMask, n, "hair mask");
        if (options.primaryMask) {
            this.primary = checkPlane(options.primaryMask, n, "primary face mask");
            for (let i = 0; i < n; i++) {
                this.mask[i] *= this.primary[i] >= 0.5 ? this.primary[i] : 0;
            }
        }
        this.checkCoverage();
        const limit = options.maxEffectCache ?? CACHE_LIMIT;
        if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
            throw new RangeError("cache limit must be 1..8");
        }
        this.limit = limit;
    }
    checkCoverage() {
        let count = 0;
        for (const v of this.mask)
            if (v >= 0.5)
                count++;
        if (count < MIN_HAIR_PIXELS)
            throw new RangeError("observed hair mask is too small");
    }
    original() {
        return {
            width: this.width, height: this.height, channels: this.channels,
            data: Uint8ClampedArray.from(this.source),
        };
    }
    get operationCounts() {
        return {
            maskComputations: this.masksPrepared,
            effectComputations: this.effectsPrepared,
            guardCalls: this.guardsRun,
            cachedEffects: this.effectCache.length,
        };
    }
    lastLevel(mode) {
        return this.levels[mode] ?? DEFAULT_LEVEL;
    }
    replaceObservedMask(mask) {
        const n = this.width * this.height;
        const updated = checkPlane(mask, n, "hair mask");
        if (this.primary) {
            for (let i = 0; i < n; i++) {
                updated[i] *= this.primary[i] >= 0.5 ? this.primary[i] : 0;
            }
        }
        const old = this.mask;
        this.mask = updated;
        try {
            this.checkCoverage();
        }
        catch (error) {
            this.mask = old;
            throw error;
        }
        this.effectCache.length = 0;
        this.masksPrepared++;
    }
    fullEffect(c, strokes) {
        let chosen;
        if (c.mode === "W28") {
            if (!strokes)
                throw new RangeError("W28 requires painted placement");
            chosen = checkPlane(strokes, this.width * this.height, "placement");
        }
        const recipeKey = [
            c.mode, c.shade, c.targetLevel, c.baseLevel,
            c.history, c.toner, c.softness,
        ].join("|");
        const hit = this.effectCache.find((item) => item.recipeKey === recipeKey && ((!chosen && !item.strokes) || (chosen && item.strokes &&
            chosen.every((v, i) => v === item.strokes?.[i]))));
        if (hit) {
            this.effectCache.splice(this.effectCache.indexOf(hit), 1);
            this.effectCache.push(hit);
            return hit.pixels;
        }
        const image = {
            width: this.width, height: this.height,
            channels: this.channels, data: this.source,
        };
        const result = c.mode === "W39"
            ? recolourHair(image, this.mask, SHADE_LAB[c.shade]).image
            : paint(image, this.mask, chosen, {
                targetLevel: c.targetLevel,
                baseLevel: c.baseLevel ?? undefined,
                history: c.history,
                toner: c.toner,
                softness: c.softness,
            }).image;
        const output = Uint8ClampedArray.from(result);
        this.effectCache.push({ recipeKey, pixels: output, strokes: chosen });
        if (this.effectCache.length > this.limit)
            this.effectCache.shift();
        this.effectsPrepared++;
        return output;
    }
    render(input, options = {}) {
        const c = choice(input.mode, input);
        const level = checkedLevel(c.level);
        const lockLevel = checkedLock(options.lockLevel ?? 1);
        if (options.previewEdge !== undefined && (!Number.isInteger(options.previewEdge) ||
            options.previewEdge < 32 || options.previewEdge > 2048)) {
            throw new RangeError("preview edge must be in 32..2048");
        }
        if (c.mode === "W28" && !options.strokes)
            throw new RangeError("W28 requires placement");
        this.levels[c.mode] = level;
        const source = this.source;
        const candidate = Uint8ClampedArray.from(source);
        if (level > 1) {
            const full = this.fullEffect(c, options.strokes);
            const factor = levelWeight(level);
            for (let i = 0; i < source.length; i += this.channels) {
                for (let channel = 0; channel < 3; channel++) {
                    candidate[i + channel] = byteRound(source[i + channel] + factor * (full[i + channel] - source[i + channel]));
                }
            }
        }
        const protector = options.guard ?? new LocalChangeGuard(this.channels);
        const decision = protector.guard(Uint8ClampedArray.from(source), Uint8ClampedArray.from(candidate), lockLevel);
        this.guardsRun++;
        if (decision.image.length !== source.length || !Number.isFinite(decision.similarity)) {
            throw new RangeError("identity guard returned invalid evidence");
        }
        const safe = Uint8ClampedArray.from(source);
        let changed = 0;
        let supported = 0;
        let distance = 0;
        for (let pixel = 0; pixel < this.mask.length; pixel++) {
            if (this.mask[pixel] < 0.5)
                continue;
            supported++;
            let differs = false;
            for (let channel = 0; channel < 3; channel++) {
                const offset = pixel * this.channels + channel;
                safe[offset] = decision.image[offset];
                distance += Math.abs(safe[offset] - source[offset]);
                differs ||= safe[offset] !== source[offset];
            }
            if (differs)
                changed++;
        }
        const shown = nearestPreview(safe, this.width, this.height, this.channels, options.previewEdge);
        return {
            image: shown.data,
            width: shown.width,
            height: shown.height,
            channels: this.channels,
            mode: c.mode,
            level,
            changedShare: changed / supported,
            meanDelta: distance / (supported * 3),
            similarityProxy: decision.similarity,
            lockApplied: true,
            lockLimited: decision.limited,
            preview: shown.preview,
            label: SIMULATION_LABEL,
            realfaceStatus: "unproven",
        };
    }
    close() {
        this.source.fill(0);
        this.mask.fill(0);
        this.effectCache.length = 0;
        delete this.levels.W28;
        delete this.levels.W39;
    }
}
//# sourceMappingURL=consultation.js.map