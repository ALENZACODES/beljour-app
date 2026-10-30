/** Browser-local canvas rendering and download-blob export.
 * No network, trackers, remote models or browser storage are used.
 * Pixel edits use one readback per render, not one readback per slider move.
 */
import { PALETTE, withAlpha } from "../ui/palette.js";
import { makeCropGeometry, previewGeometry } from "./crop.js";
import { applyCurvePixels, makeCurveLuts } from "./curves.js";
import { blendMaskedPixels, cropMaskMapping, rasterMask } from "./masks.js";
import { planProExport, simulationText } from "./presets.js";
import { projectSource } from "./source-projection.js";
import { scrubEncodedBlob } from "./export-privacy.js";
import { GpuProSurface } from "./gpu.js";
import { checkRecipe, ProInputError, requireDimensions } from "./types.js";
export const PREVIEW_BUDGET_MS = 100;
export const EXPORT_BUDGET_MS = 2_000;
export function drawLabel(ctx, label, width, height) {
    const fontSize = Math.max(12, Math.round(width / 40));
    const margin = Math.max(6, Math.round(fontSize * 0.6));
    ctx.save();
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const textWidth = ctx.measureText(label).width;
    const x = margin;
    const y = height - fontSize * 2 - margin;
    ctx.fillStyle = withAlpha(PALETTE.plum, 0.88); // burned into the exported image: fixed palette
    ctx.fillRect(x, y, textWidth + 2 * margin, fontSize * 2);
    ctx.fillStyle = PALETTE.cream;
    ctx.fillText(label, x + margin, y + fontSize);
    ctx.restore();
}
export class CanvasProSurface {
    canvas;
    context;
    constructor(width, height) {
        requireDimensions(width, height);
        const canvas = typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(width, height)
            : document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context)
            throw new ProInputError("This device has no usable 2D image canvas", "PRO_CANVAS_MISSING");
        this.canvas = canvas;
        this.context = context;
    }
    draw(source, geometry, curves, label, matte, masks = []) {
        const ctx = this.context;
        const { width, height } = geometry;
        projectSource(ctx, source, geometry, matte);
        if (!curves.neutral) {
            const pixels = ctx.getImageData(0, 0, width, height);
            if (masks.length === 0) {
                applyCurvePixels(pixels.data, curves);
            }
            else {
                const transform = cropMaskMapping(geometry, source.width, source.height);
                const coverage = rasterMask(masks, width, height, transform);
                blendMaskedPixels(pixels.data, curves.red, curves.green, curves.blue, coverage);
            }
            ctx.putImageData(pixels, 0, 0);
        }
        if (label)
            drawLabel(ctx, label, width, height);
    }
    async encode(mime, quality) {
        let blob;
        if (typeof OffscreenCanvas !== "undefined" && this.canvas instanceof OffscreenCanvas) {
            blob = await this.canvas.convertToBlob({ type: mime, quality });
        }
        else {
            blob = await new Promise((resolve, reject) => {
                this.canvasToBlob(resolve, reject, mime, quality);
            });
        }
        if (blob.size === 0 || blob.type !== mime) {
            throw new ProInputError("This browser cannot encode the selected image format", "PRO_CODEC_MISSING");
        }
        return blob;
    }
    canvasToBlob(resolve, reject, mime, quality) {
        const canvas = this.canvas;
        if (!(canvas instanceof HTMLCanvasElement)) {
            reject(new ProInputError("Canvas export is unavailable"));
            return;
        }
        canvas.toBlob((blob) => {
            if (blob)
                resolve(blob);
            else
                reject(new ProInputError("Image encoding failed", "PRO_ENCODE_FAILED"));
        }, mime, quality);
    }
}
export const browserSurface = (width, height) => new GpuProSurface(width, height);
function validateSource(source, recipe) {
    requireDimensions(source.width, source.height);
    checkRecipe(recipe);
    if (!source.image)
        throw new ProInputError("A decoded local image is required");
}
export function previewPhoto(source, recipe, factory = browserSurface, clock = () => performance.now()) {
    validateSource(source, recipe);
    const start = clock();
    const geometry = previewGeometry(makeCropGeometry(source.width, source.height, recipe.crop));
    const surface = factory(geometry.width, geometry.height);
    surface.draw(source, geometry, makeCurveLuts(recipe.curves), simulationText(recipe), false, recipe.masks);
    const elapsedMs = clock() - start;
    return {
        surface,
        width: geometry.width,
        height: geometry.height,
        elapsedMs,
        overBudget: elapsedMs >= PREVIEW_BUDGET_MS,
    };
}
export async function exportPhotoPro(source, recipe, fileStem, factory = browserSurface, clock = () => performance.now()) {
    validateSource(source, recipe);
    const start = clock();
    const planned = planProExport(source.width, source.height, recipe, fileStem);
    const { preset, geometry } = planned;
    const surface = factory(geometry.width, geometry.height);
    surface.draw(source, geometry, makeCurveLuts(recipe.curves), planned.label, preset.mime === "image/jpeg", recipe.masks);
    const blob = await scrubEncodedBlob(await surface.encode(preset.mime, preset.quality), preset.mime);
    const elapsedMs = clock() - start;
    return {
        name: planned.filename,
        blob,
        mime: preset.mime,
        width: geometry.width,
        height: geometry.height,
        label: planned.label,
        elapsedMs,
        overBudget: elapsedMs >= EXPORT_BUDGET_MS,
    };
}
//# sourceMappingURL=render.js.map