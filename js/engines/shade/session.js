/** W6 session-bound cheek colour reading and locally guarded sample tint.
 * Reference shades are invented, not physical products. Nothing is persisted,
 * uploaded or inferred from skin colour. Readings go through the checked cheek-first
 * entry of skin-accuracy.ts: the historical reading first, then the two-cheek consensus
 * only when that reading refuses. Author: John Khan.
 */
import { applyGuard, PixelArrayGuard } from "../../commerce/identity.js";
import { editKey, PhotoEditCache } from "../../commerce/preview-cache.js";
import { DEFAULT_LOCK, toLegacy, validateLevel } from "../../commerce/strength.js";
import { labToSrgb } from "./colourspace.js";
import { zoneMasks } from "./finder.js";
import { assessSkinZones, publicConsensus } from "./skin-accuracy.js";
async function hashPhoto(image, points, options) {
    const bytes = new Uint8Array(image.data.length);
    for (let i = 0; i < bytes.length; i++)
        bytes[i] = image.data[i];
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
    // The edit ID also binds supplied geometry/reference changes, not only photo bytes.
    const anchors = JSON.stringify({ points, neutral: options.neutralMask ? Array.from(options.neutralMask) : null,
        background: options.backgroundMask ? Array.from(options.backgroundMask) : null });
    const typed = new TextEncoder().encode(anchors);
    const input = new Uint8Array(typed.length);
    input.set(typed);
    const id = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
    const evidence = Array.from(id).slice(0, 8).map((v) => v.toString(16).padStart(2, "0")).join("");
    return { hash, evidence };
}
function pixels(image) {
    if (image.width < 16 || image.height < 16 || image.width * image.height > 4_500_000 ||
        (image.channels !== 3 && image.channels !== 4) ||
        image.data.length !== image.width * image.height * image.channels)
        throw RangeError("Invalid shade image.");
    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i++) {
        const offset = image.channels * i;
        for (let channel = 0; channel < 3; channel++)
            rgba[4 * i + channel] = image.data[offset + channel];
        rgba[4 * i + 3] = image.channels === 4 ? image.data[offset + 3] : 255;
    }
    return rgba;
}
function shrink(source, width, height, phase) {
    if (phase === "release" || Math.max(width, height) <= 384)
        return { pixels: source, width, height };
    const ratio = 384 / Math.max(width, height);
    const smallWidth = Math.max(1, Math.round(width * ratio));
    const smallHeight = Math.max(1, Math.round(height * ratio));
    const scaled = new Uint8ClampedArray(smallWidth * smallHeight * 4);
    for (let y = 0; y < smallHeight; y++)
        for (let x = 0; x < smallWidth; x++) {
            const ox = Math.min(width - 1, Math.floor(x * width / smallWidth));
            const oy = Math.min(height - 1, Math.floor(y * height / smallHeight));
            const i = (y * smallWidth + x) * 4;
            const j = (oy * width + ox) * 4;
            scaled.set(source.subarray(j, j + 4), i);
        }
    return { pixels: scaled, width: smallWidth, height: smallHeight };
}
export class ShadeSession {
    readingMemo = new PhotoEditCache();
    frameMemo = new PhotoEditCache();
    readingComputes = 0;
    renderComputes = 0;
    async prepare(image, points, options = {}) {
        pixels(image);
        const { hash, evidence } = await hashPhoto(image, points, options);
        return this.readingMemo.getOrCompute(editKey(hash, `shade_sensing_${evidence}`, 3.0), () => {
            this.readingComputes++;
            const geometry = zoneMasks(points, image.width, image.height);
            const mask = new Uint8Array(image.width * image.height);
            for (let i = 0; i < mask.length; i++) {
                mask[i] = geometry.cheek_left[i] || geometry.cheek_right[i] ? 1 : 0;
            }
            const found = assessSkinZones(image, geometry, options);
            return { photoHash: hash, width: image.width, height: image.height,
                evidenceHash: evidence, landmarks: points.map((p) => Array.isArray(p) ? [...p] : { ...p }),
                cheekMask: mask, reading: found.reading, audit: found.audit, source: found.source,
                consensus: found.consensus === null ? null : publicConsensus(found.consensus) };
        });
    }
    async apply(image, preparation, level, options = {}) {
        const checked = validateLevel(level);
        const phase = options.phase ?? "release";
        if (phase !== "interactive" && phase !== "release")
            throw RangeError("Unsupported preview phase.");
        const now = await hashPhoto(image, preparation.landmarks, {});
        if (now.hash !== preparation.photoHash || image.width !== preparation.width ||
            image.height !== preparation.height)
            throw RangeError("Shade belongs to another image.");
        if (preparation.reading.refused || !preparation.audit.usable || !preparation.reading.best) {
            throw RangeError("Unreliable shade cannot be applied.");
        }
        const raw = pixels(image);
        const hadHits = this.frameMemo.hits;
        const key = editKey(preparation.photoHash, `shade_tint_${phase}_${preparation.evidenceHash}`, checked);
        const result = this.frameMemo.getOrCompute(key, () => {
            this.renderComputes++;
            const target = labToSrgb(preparation.reading.best?.lab ?? [0, 0, 0]);
            const opacity = toLegacy(checked) / 100 * 0.25;
            const changed = raw.slice();
            for (let i = 0; i < preparation.cheekMask.length; i++) {
                if (!preparation.cheekMask[i])
                    continue;
                for (let c = 0; c < 3; c++) {
                    changed[i * 4 + c] = Math.round(raw[i * 4 + c] * (1 - opacity) + target[c] * opacity);
                }
            }
            return changed;
        });
        const base = shrink(raw, image.width, image.height, phase);
        const edited = shrink(result, image.width, image.height, phase);
        const guarded = await applyGuard(base.pixels, edited.pixels, options.guard ?? new PixelArrayGuard(), options.lockLevel ?? DEFAULT_LOCK);
        return { image: guarded.image, width: base.width, height: base.height,
            strengthLevel: checked, simulation: true,
            label: "In-house reference tint simulation; no real product validation.", phase,
            identityGuard: guarded, providerCalls: 0, readingCached: this.readingMemo.hits > 0 ||
                hadHits < this.frameMemo.hits };
    }
    clear() {
        this.readingMemo.clear();
        this.frameMemo.clear();
    }
}
//# sourceMappingURL=session.js.map