/** Deliberately approximate photo-local colour simulation; no trained models.
 * Geometry mirrors the coarse Python commerce preview. Face landmarks are not guessed.
 * A full face try-on needs a validated segmentation model or the consented YouCam API.
 * Author: John Khan.
 */
import { applyGuard, PixelGuard } from "./identity.js";
import { DEFAULT_LOCK, toLegacy, validateLevel } from "./strength.js";
export function maskShapes(category) {
    if (category === "complexion")
        return [
            { cx: 0.50, cy: 0.495, rx: 0.19, ry: 0.275, mode: "add" },
            { cx: 0.43, cy: 0.42, rx: 0.045, ry: 0.03, mode: "subtract" },
            { cx: 0.57, cy: 0.42, rx: 0.045, ry: 0.03, mode: "subtract" },
            { cx: 0.50, cy: 0.645, rx: 0.06, ry: 0.035, mode: "subtract" },
        ];
    if (category === "cheek")
        return [
            { cx: 0.405, cy: 0.53, rx: 0.058, ry: 0.04, mode: "add" },
            { cx: 0.595, cy: 0.53, rx: 0.058, ry: 0.04, mode: "add" },
        ];
    if (category === "lip")
        return [{ cx: 0.5, cy: 0.639, rx: 0.055, ry: 0.015, mode: "add" }];
    return [];
}
function ellipse(ctx, geometry, w, h) {
    ctx.beginPath();
    ctx.ellipse(geometry.cx * w, geometry.cy * h, geometry.rx * w, geometry.ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
}
export function renderLocal(source, product, strength, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK) {
    if (!product.vto)
        throw Error("This item does not support visual try-on.");
    if (!Number.isInteger(strength) || strength < 0 || strength > 100)
        throw Error("Choose a valid strength.");
    const dest = document.createElement("canvas");
    dest.width = source.width;
    dest.height = source.height;
    const ctx = dest.getContext("2d");
    if (!ctx)
        throw Error("Your browser does not support this local preview.");
    ctx.drawImage(source, 0, 0);
    if (!strength) {
        const checked = guard.guard(source, dest, validateLevel(lockLevel));
        if (checked instanceof Promise)
            throw Error("Use renderLevelAsync for an asynchronous identity guard.");
        return checked.image;
    }
    const mask = document.createElement("canvas");
    mask.width = source.width;
    mask.height = source.height;
    const m = mask.getContext("2d");
    if (!m)
        throw Error("Could not make an overlay mask.");
    for (const shape of maskShapes(product.category)) {
        m.globalCompositeOperation = shape.mode === "subtract" ? "destination-out" : "source-over";
        m.fillStyle = "#ffffff";
        ellipse(m, shape, mask.width, mask.height);
    }
    m.globalCompositeOperation = "source-in";
    m.fillStyle = product.swatch;
    m.fillRect(0, 0, mask.width, mask.height);
    ctx.globalAlpha = (strength / 100) * (product.category === "complexion" ? 0.38 : 0.55);
    ctx.drawImage(mask, 0, 0);
    ctx.globalAlpha = 1;
    const checked = guard.guard(source, dest, validateLevel(lockLevel));
    if (checked instanceof Promise)
        throw Error("Use renderLevelAsync for an asynchronous identity guard.");
    return checked.image;
}
/** Preferred level renderer: always validates tenths before legacy conversion. */
export function renderLevel(source, product, level, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK) {
    return renderLocal(source, product, toLegacy(validateLevel(level)), guard, lockLevel);
}
/** Capped-size draft during input; full-resolution result comes on release. */
export function renderInteractive(source, product, level, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK) {
    const maxEdge = 384;
    const ratio = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(source.width * ratio));
    small.height = Math.max(1, Math.round(source.height * ratio));
    const ctx = small.getContext("2d");
    if (!ctx)
        throw Error("Cannot prepare low-resolution preview.");
    ctx.drawImage(source, 0, 0, small.width, small.height);
    return renderLevel(small, product, level, guard, lockLevel);
}
export async function renderLevelAsync(source, product, level, guard, lockLevel = DEFAULT_LOCK) {
    const raw = renderLocal(source, product, toLegacy(validateLevel(level)), new PixelGuard(), lockLevel);
    return (await applyGuard(source, raw, guard, lockLevel)).image;
}
export async function renderProviderResult(dataUrl, reference, guard = new PixelGuard(), lockLevel = DEFAULT_LOCK) {
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 15_000_000) {
        throw Error("The preview image reply was not a supported bounded image.");
    }
    // Decode the bounded data URL locally; a data URL must never require a network request.
    const comma = dataUrl.indexOf(",");
    const encoded = dataUrl.slice(comma + 1);
    const decoded = atob(encoded);
    if (decoded.length > 11_000_000)
        throw Error("The preview image is too large to decode.");
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1)
        bytes[index] = decoded.charCodeAt(index);
    const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    try {
        if (bitmap.width * bitmap.height > 24_000_000)
            throw Error("Preview image exceeds the pixel limit.");
        const result = document.createElement("canvas");
        result.width = reference.width;
        result.height = reference.height;
        const context = result.getContext("2d");
        if (!context)
            throw Error("Could not display the result image.");
        context.drawImage(bitmap, 0, 0, result.width, result.height);
        return (await applyGuard(reference, result, guard, lockLevel)).image;
    }
    finally {
        bitmap.close();
    }
}
//# sourceMappingURL=local-render.js.map