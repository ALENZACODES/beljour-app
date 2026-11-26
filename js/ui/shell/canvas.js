/** Canvas preview, scaling and photo-labelled export. No network, state or asset imports.
 * Recreates ImageData with a new Uint8ClampedArray for compatibility with TypeScript 7.
 * Author: John Khan.
 */
import { toRGBA } from "../../engines/core/buffer.js";
import { PALETTE, withAlpha } from "../palette.js";
export function paint(canvas, image, options = {}) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
        throw new Error("2D canvas is not supported");
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(toRGBA(image)), image.width, image.height), 0, 0);
    if (options.overlay !== false && options.simulate)
        label(ctx, image.width, image.height, options.label ?? SIMULATION_TAG);
    const zoom = options.zoom ?? 1;
    if (!(zoom >= 0.25 && zoom <= 8))
        throw new RangeError("Zoom must be 25–800%");
    canvas.style.width = `${Math.round(image.width * zoom)}px`;
    canvas.style.height = `${Math.round(image.height * zoom)}px`;
}
/** The honesty tag every simulated picture carries: short, so it can sit in a corner. */
export const SIMULATION_TAG = "Edited \u00b7 simulation";
/** A small, quiet tag in the bottom-right corner: a translucent dark pill with light text, about
 * 2% of the shorter side tall, so it reads on any photo without covering her. Long text is cut. */
export function label(ctx, width, height, text) {
    const font = Math.max(9, Math.round(Math.min(width, height) / 52));
    const padX = Math.max(4, Math.round(font * 0.6)), padY = Math.max(2, Math.round(font * 0.3));
    const margin = Math.max(4, Math.round(font * 0.7));
    const str = text.length > 48 ? text.slice(0, 48) : text;
    ctx.save();
    ctx.font = `500 ${font}px system-ui, sans-serif`;
    const w = Math.min(width - 2 * margin, ctx.measureText(str).width + 2 * padX), h = font + 2 * padY;
    const x = width - margin - w, y = height - margin - h, r = h / 2;
    ctx.fillStyle = "rgba(20, 14, 18, 0.38)"; // the tag travels with the picture: fixed colours
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = withAlpha(PALETTE.cream, 0.92);
    ctx.textBaseline = "middle";
    ctx.fillText(str, x + padX, y + h / 2 + 0.5, Math.max(1, w - 2 * padX));
    ctx.restore();
}
/** How long the download link's object URL stays alive after the click. Some browsers start
    the download asynchronously and cancel it if the URL is revoked in the same task. */
export const DOWNLOAD_URL_REVOKE_MS = 1000;
export function downloadCanvas(canvas, filename = "beljour-preview.png") {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Couldn't export this canvas"));
                return;
            }
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_MS);
            resolve();
        }, "image/png");
    });
}
//# sourceMappingURL=canvas.js.map