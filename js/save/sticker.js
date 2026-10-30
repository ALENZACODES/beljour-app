import { cpuResize } from "../engines/upscale/quality-generator.js";
import { regionMask } from "../data/regions/index.js";
import { encodePng } from "./apng.js";
import { storeZip } from "./export.js";
export const STICKER_SIDE = 320; // ASSUMED: messaging apps show stickers small
export const LOOP_FRAMES = 12, LOOP_FPS = 12;
export const MOTION_PAD = 0.12; // room around the sticker so motion never clips; ASSUMED
export const MAX_CAPTION = 40;
export const ANIMATIONS = ["still", "bounce", "wiggle", "pulse"];
export class StickerRefused extends RangeError {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** Pick the cut-out: device person mask, then her marked area, then her face outline. */
export function chooseCutout(image, options) {
    const { width, height } = image;
    const fit = (m) => m.width === width && m.height === height;
    if (options.person && fit(options.person))
        return { mask: Float32Array.from(options.person.data), width, height, from: "person", note: "Cut out along your outline, found on this device." };
    if (options.marked && fit(options.marked))
        return { mask: Float32Array.from(options.marked.data), width, height, from: "marked", note: "Cut out along the area you marked." };
    if (options.face && options.face.length >= 468) {
        const oval = regionMask("face_oval", options.face, width, height, { normalized: false, supersample: 2 });
        return { mask: Float32Array.from(oval.data), width, height, from: "face", note: "Cut out along your face outline only: hair and shoulders are left out. Mark your outline for a fuller sticker." };
    }
    throw new StickerRefused("no_cutout", "There's no outline to cut out yet. Mark the person area, or read face points on this device.");
}
function bbox(c) {
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
            if (c.mask[y * c.width + x] < 0.5)
                continue;
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
        }
    if (x1 < 0)
        throw new StickerRefused("empty_cutout", "The outline is empty.");
    return { x0, y0, x1, y1 };
}
/** The cut-out, cropped, fitted inside STICKER_SIDE and outlined in white. Alpha is the mask. */
export function cutSticker(image, cut, outline) {
    if (image.channels !== 3 && image.channels !== 4)
        throw new StickerRefused("bad_photo", "A sticker needs an RGB or RGBA photo.");
    const b = bbox(cut);
    const cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1;
    const crop = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
            const p = (b.y0 + y) * image.width + b.x0 + x, o = (y * cw + x) * 4, c = image.channels;
            crop[o] = image.data[p * c];
            crop[o + 1] = image.data[p * c + 1];
            crop[o + 2] = image.data[p * c + 2];
            crop[o + 3] = Math.round(255 * Math.min(1, Math.max(0, cut.mask[p])) * (c === 4 ? image.data[p * 4 + 3] / 255 : 1));
        }
    const r = outline ?? Math.max(2, Math.round(Math.max(cw, ch) / 60));
    const scale = Math.min(1, (STICKER_SIDE - 2 * r) / Math.max(cw, ch));
    const sw = Math.max(1, Math.round(cw * scale)), sh = Math.max(1, Math.round(ch * scale));
    const fitted = scale < 1 ? cpuResize({ width: cw, height: ch, data: crop }, sw, sh) : crop;
    const W = sw + 2 * r, H = sh + 2 * r;
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < sh; y++)
        out.set(fitted.subarray(y * sw * 4, (y + 1) * sw * 4), ((y + r) * W + r) * 4);
    // White outline: any transparent pixel within r of a solid one turns white.
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && out[(y * W + x) * 4 + 3] >= 128;
    const ring = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            if (solid(x, y))
                continue;
            search: for (let dy = -r; dy <= r; dy++)
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= r * r && solid(x + dx, y + dy)) {
                        ring[y * W + x] = 1;
                        break search;
                    }
                }
        }
    for (let p = 0; p < W * H; p++)
        if (ring[p]) {
            const a = out[p * 4 + 3] / 255;
            for (let k = 0; k < 3; k++)
                out[p * 4 + k] = Math.round(out[p * 4 + k] * a + 255 * (1 - a));
            out[p * 4 + 3] = 255;
        }
    return { width: W, height: H, data: out };
}
export function checkCaption(text) {
    const clean = (text ?? "").trim();
    if (clean.length > MAX_CAPTION || /[\u0000-\u001f\u007f]/.test(clean))
        throw new StickerRefused("bad_caption", `A caption is one line of up to ${MAX_CAPTION} characters.`);
    return clean;
}
/** The caption line under the sticker, including the simulation note when it applies. */
export function captionLine(text, simulationLabel, isSimulation) {
    const clean = checkCaption(text);
    const note = simulationLabel && isSimulation ? "Simulation" : "";
    return [clean, note].filter(Boolean).join(" · ");
}
/** Stack a caption strip (drawn by the browser in the system font) under the sticker. */
export function withCaption(sticker, strip) {
    if (!strip)
        return sticker;
    const W = Math.max(sticker.width, strip.width), H = sticker.height + strip.height;
    const out = new Uint8ClampedArray(W * H * 4);
    const place = (f, top) => {
        const left = Math.floor((W - f.width) / 2);
        for (let y = 0; y < f.height; y++)
            out.set(f.data.subarray(y * f.width * 4, (y + 1) * f.width * 4), ((top + y) * W + left) * 4);
    };
    place(sticker, 0);
    place(strip, sticker.height);
    return { width: W, height: H, data: out };
}
/** One loop of an animation: the sticker moved, turned or scaled about its centre on a padded,
 * transparent canvas, sampled bilinearly. "still" is one frame. */
export function animate(sticker, kind) {
    if (kind === "still")
        return [sticker];
    const pad = Math.round(Math.max(sticker.width, sticker.height) * MOTION_PAD);
    const W = sticker.width + 2 * pad, H = sticker.height + 2 * pad, cx = W / 2, cy = H / 2;
    const frames = [];
    for (let i = 0; i < LOOP_FRAMES; i++) {
        const phase = (2 * Math.PI * i) / LOOP_FRAMES;
        const dy = kind === "bounce" ? -Math.abs(Math.sin(phase)) * pad * 0.9 : 0;
        const angle = kind === "wiggle" ? (8 * Math.PI / 180) * Math.sin(phase) : 0;
        const scale = kind === "pulse" ? 0.92 + 0.08 * (0.5 + 0.5 * Math.cos(phase)) : 1;
        const cos = Math.cos(-angle) / scale, sin = Math.sin(-angle) / scale;
        const data = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const ux = x + 0.5 - cx, uy = y + 0.5 - cy - dy;
                const sx = cos * ux - sin * uy + sticker.width / 2 - 0.5, sy = sin * ux + cos * uy + sticker.height / 2 - 0.5;
                const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
                const o = (y * W + x) * 4;
                // The four bilinear taps, worked out once per pixel and added in the same order for
                // every channel (R7 measurements; same values as building them per channel).
                const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
                const inX0 = x0 >= 0 && x0 < sticker.width, inX1 = x0 + 1 >= 0 && x0 + 1 < sticker.width;
                const inY0 = y0 >= 0 && y0 < sticker.height, inY1 = y0 + 1 >= 0 && y0 + 1 < sticker.height;
                const t00 = w00 > 0 && inX0 && inY0 ? (y0 * sticker.width + x0) * 4 : -1;
                const t10 = w10 > 0 && inX1 && inY0 ? (y0 * sticker.width + x0 + 1) * 4 : -1;
                const t01 = w01 > 0 && inX0 && inY1 ? ((y0 + 1) * sticker.width + x0) * 4 : -1;
                const t11 = w11 > 0 && inX1 && inY1 ? ((y0 + 1) * sticker.width + x0 + 1) * 4 : -1;
                if (t00 < 0 && t10 < 0 && t01 < 0 && t11 < 0)
                    continue; // all four outside: stays 0
                for (let k = 0; k < 4; k++) {
                    let v = 0;
                    if (t00 >= 0)
                        v += w00 * sticker.data[t00 + k];
                    if (t10 >= 0)
                        v += w10 * sticker.data[t10 + k];
                    if (t01 >= 0)
                        v += w01 * sticker.data[t01 + k];
                    if (t11 >= 0)
                        v += w11 * sticker.data[t11 + k];
                    data[o + k] = Math.round(v);
                }
            }
        frames.push({ width: W, height: H, data });
    }
    return frames;
}
/** Every animation of one sticker as PNG / animated PNG in one zip. */
export function stickerPack(sticker, cut) {
    const files = ANIMATIONS.map((kind) => {
        const frames = animate(sticker, kind);
        return { name: `BELJOUR_Sticker_${kind}.png`, bytes: encodePng(frames, LOOP_FPS), frames: frames.length };
    });
    return { zip: storeZip(files.map((f) => ({ name: `BELJOUR Stickers/${f.name}`, bytes: f.bytes }))), files, from: cut.from, note: cut.note };
}
//# sourceMappingURL=sticker.js.map