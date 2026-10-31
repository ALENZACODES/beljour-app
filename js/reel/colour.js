/**
 * Colour transfer for reels. From each keyframe we learn how YouCam's makeup changed the
 * average CIELAB colour of three regions (skin, lips, cheeks). Every other frame gets that
 * change applied inside the same regions, found from its own landmarks. The per frame work
 * runs in a WebGL shader (reel/gl.ts); this file has the CPU side and the shared maths.
 */
export const REGIONS = ["skin", "lips", "cheeks"];
const LIN = new Float32Array(256).map((_, v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
function f(t) {
    return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}
export function rgbToLab(r, g, b) {
    const R = LIN[r], G = LIN[g], B = LIN[b];
    const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
    const fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToRgb([L, a, b]) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
    const lin = [
        3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
        -0.969266 * x + 1.8760108 * y + 0.041556 * z,
        0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
    return lin.map((c) => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.max(0, Math.min(255, Math.round(v * 255)));
    });
}
/** Mean Lab inside a mask (alpha 0..1 per pixel). */
export function meanLab(rgba, mask) {
    let sL = 0, sa = 0, sb = 0, sw = 0;
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
        const w = mask[p];
        if (w < 0.5)
            continue;
        const [L, a, b] = rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]);
        sL += L * w;
        sa += a * w;
        sb += b * w;
        sw += w;
    }
    return sw ? [sL / sw, sa / sw, sb / sw] : null;
}
export function regionDelta(before, after, mask) {
    const a = meanLab(before, mask), b = meanLab(after, mask);
    if (!a || !b)
        return [0, 0, 0];
    // keep the change believable: cap lightness and colour shifts
    const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
    return [clamp(b[0] - a[0], 25), clamp(b[1] - a[1], 30), clamp(b[2] - a[2], 30)];
}
export function mixDeltas(all, weights) {
    const out = { skin: [0, 0, 0], lips: [0, 0, 0], cheeks: [0, 0, 0] };
    all.forEach((d, k) => {
        for (const r of REGIONS)
            for (let c = 0; c < 3; c++)
                out[r][c] += d[r][c] * (weights[k] ?? 0);
    });
    return out;
}
/** CPU version of the shader, used by tests and as a fallback for still images. */
export function applyDeltas(rgba, masks, d) {
    const out = new Uint8ClampedArray(rgba);
    for (let p = 0, i = 0; p < masks.skin.length; p++, i += 4) {
        const ws = masks.skin[p], wl = masks.lips[p], wc = masks.cheeks[p];
        if (ws + wl + wc < 1e-3)
            continue;
        const lab = rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]);
        for (let c = 0; c < 3; c++)
            lab[c] += ws * d.skin[c] + wl * d.lips[c] + wc * d.cheeks[c];
        const [r, g, b] = labToRgb(lab);
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
    }
    return out;
}
// Face mesh polygons for each region -------------------------------------------
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
    377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];
export const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
export const BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
export const CHEEK_CENTRES = [205, 425];
/**
 * Draws the three region masks into the red, green and blue channels of `out`:
 * red = skin (face minus eyes, brows and lips), green = lips (minus the mouth opening),
 * blue = cheeks. Each region is drawn on its own scratch canvas with a blur for soft edges,
 * then the three are added together.
 */
export function drawMasks(out, scratch, pts, w, h, feather) {
    const path = (g, idx) => {
        g.beginPath();
        idx.forEach((i, k) => (k ? g.lineTo(pts[i].x * w, pts[i].y * h) : g.moveTo(pts[i].x * w, pts[i].y * h)));
        g.closePath();
    };
    const layer = (colour, draw, holes, blur) => {
        const g = scratch;
        g.save();
        g.globalCompositeOperation = "source-over";
        g.filter = "none";
        g.clearRect(0, 0, w, h);
        g.filter = `blur(${blur}px)`;
        g.fillStyle = colour;
        draw(g);
        g.globalCompositeOperation = "destination-out";
        g.fillStyle = "#000";
        for (const hole of holes) {
            path(g, hole);
            g.fill();
        }
        g.restore();
        out.drawImage(g.canvas, 0, 0);
    };
    out.save();
    out.globalCompositeOperation = "source-over";
    out.fillStyle = "#000";
    out.fillRect(0, 0, w, h);
    out.globalCompositeOperation = "lighter";
    layer("#ff0000", (g) => { path(g, FACE_OVAL); g.fill(); }, [EYE_R, EYE_L, BROW_R, BROW_L, LIPS_OUTER], feather);
    layer("#00ff00", (g) => { path(g, LIPS_OUTER); g.fill(); }, [LIPS_INNER], feather * 0.5);
    const iod = Math.hypot((pts[263].x - pts[33].x) * w, (pts[263].y - pts[33].y) * h);
    layer("#0000ff", (g) => {
        for (const c of CHEEK_CENTRES) {
            g.beginPath();
            g.ellipse(pts[c].x * w, pts[c].y * h, iod * 0.22, iod * 0.16, 0, 0, Math.PI * 2);
            g.fill();
        }
    }, [], feather * 2);
    out.restore();
}
/** Splits RGBA mask pixels into three float masks. */
export function splitMasks(rgba) {
    const n = rgba.length / 4;
    const skin = new Float32Array(n), lips = new Float32Array(n), cheeks = new Float32Array(n);
    for (let p = 0; p < n; p++) {
        skin[p] = rgba[p * 4] / 255;
        lips[p] = rgba[p * 4 + 1] / 255;
        cheeks[p] = rgba[p * 4 + 2] / 255;
    }
    return { skin, lips, cheeks };
}
