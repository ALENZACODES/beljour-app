/** Usability 4.1: face chips are at least 44 px and show that face's own thumbnail,
 * cut from her photo on this device (never a stock or model face). Pure helpers plus
 * one DOM painter; the crop is computed from her recorded face points.
 * Author: John Khan.
 */
import { byteImage } from "../engines/core/buffer.js";
export const CHIP_PX = 44;
export const THUMB_PX = 36;
export const CHIP_PADDING = 0.25;
/** Square crop around the face points, padded by 25% and kept inside the photo. */
export function faceChipBox(points, width, height) {
    if (!points.length || !(width >= 1 && height >= 1))
        return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]))
            return null;
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
    }
    const side = Math.max(x1 - x0, y1 - y0) * (1 + 2 * CHIP_PADDING);
    if (!(side >= 2))
        return null;
    const size = Math.min(Math.round(side), width, height);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const x = Math.round(Math.min(Math.max(cx - size / 2, 0), width - size));
    const y = Math.round(Math.min(Math.max(cy - size / 2, 0), height - size));
    return { x, y, size };
}
/** Area-averaged square thumbnail of the crop (RGB or RGBA in, RGBA out). */
export function chipThumbnail(image, box, px = THUMB_PX) {
    const out = byteImage(px, px, 4);
    const c = image.channels;
    for (let ty = 0; ty < px; ty++) {
        for (let tx = 0; tx < px; tx++) {
            const sx0 = box.x + (tx * box.size) / px, sx1 = box.x + ((tx + 1) * box.size) / px;
            const sy0 = box.y + (ty * box.size) / px, sy1 = box.y + ((ty + 1) * box.size) / px;
            const sum = [0, 0, 0];
            let n = 0;
            for (let y = Math.floor(sy0); y < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); y++) {
                for (let x = Math.floor(sx0); x < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); x++) {
                    const yy = Math.min(Math.max(y, 0), image.height - 1), xx = Math.min(Math.max(x, 0), image.width - 1);
                    const i = (yy * image.width + xx) * c;
                    sum[0] += image.data[i];
                    sum[1] += image.data[i + 1];
                    sum[2] += image.data[i + 2];
                    n++;
                }
            }
            const o = (ty * px + tx) * 4;
            out.data[o] = Math.round(sum[0] / n);
            out.data[o + 1] = Math.round(sum[1] / n);
            out.data[o + 2] = Math.round(sum[2] / n);
            out.data[o + 3] = 255;
        }
    }
    return out;
}
/** Put her own face thumbnail inside a chip button; returns false when not possible. */
export function paintFaceChip(doc, chip, image, points) {
    const box = points ? faceChipBox(points, image.width, image.height) : null;
    if (!box)
        return false;
    // Repaint only when the photo or the crop changes.
    const key = `${image.width}x${image.height}:${box.x},${box.y},${box.size}:${image.data.length}`;
    if (chip.dataset.thumb === key && chip.querySelector(".lg-face-thumb"))
        return true;
    const thumb = chipThumbnail(image, box);
    const canvas = doc.createElement("canvas");
    canvas.width = THUMB_PX;
    canvas.height = THUMB_PX;
    canvas.className = "lg-face-thumb";
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ImageData === "undefined")
        return false;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(thumb.data), THUMB_PX, THUMB_PX), 0, 0);
    chip.querySelector(".lg-face-thumb")?.remove();
    chip.prepend(canvas);
    chip.dataset.thumb = key;
    return true;
}
//# sourceMappingURL=face-chip.js.map