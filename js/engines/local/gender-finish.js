import { CONTOURS } from "../../data/regions/generated/topology.js";
import { faceFrame } from "../shape/geometry.js";
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const at = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
function ellipse(x, y, p, rx, ry) {
    return Math.exp(-0.5 * (((x - p[0]) / rx) ** 2 + ((y - p[1]) / ry) ** 2));
}
function insidePolygon(x, y, contour) {
    let inside = false;
    for (let j = contour.length - 1, i = 0; i < contour.length; j = i++) {
        const a = contour[j], b = contour[i];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])
            inside = !inside;
    }
    return inside;
}
function edgeDistance(x, y, contour) {
    let best = Infinity;
    for (let j = contour.length - 1, i = 0; i < contour.length; j = i++) {
        const a = contour[j], b = contour[i], dx = b[0] - a[0], dy = b[1] - a[1];
        const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / Math.max(1e-9, dx * dx + dy * dy));
        best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
    }
    return best;
}
/** Small box mean gives a photo-derived lighting field without flattening pore-scale residuals. */
function lowLuma(image, radius) {
    const { width: w, height: h, channels: ch } = image, stride = w + 1;
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
        let row = 0;
        for (let x = 1; x <= w; x++) {
            const j = ((y - 1) * w + x - 1) * ch;
            row += 0.2126 * image.data[j] + 0.7152 * image.data[j + 1] + 0.0722 * image.data[j + 2];
            integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
        }
    }
    const out = new Float64Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const a = Math.max(0, x - radius), b = Math.min(w, x + radius + 1);
            const c = Math.max(0, y - radius), d = Math.min(h, y + radius + 1);
            out[y * w + x] = (integral[d * stride + b] - integral[c * stride + b] - integral[d * stride + a] + integral[c * stride + a]) / ((b - a) * (d - c));
        }
    return out;
}
/**
 * Appearance finish after the safety-checked mesh warp. Light/shadow only changes
 * the low-frequency component; existing pores and sensor noise remain untouched.
 * No assertion about gender identity, anatomy, or actual hormone effects is made.
 */
export function finishGender(image, mesh, slider) {
    if (!(Number.isFinite(slider) && slider >= -100 && slider <= 100))
        throw new RangeError("gender finish slider must be -100..100");
    if (Math.abs(slider) < 1e-9)
        return { ...image, data: new Uint8Array(image.data) };
    if (mesh.length < 468)
        throw new RangeError("gender finish requires face mesh");
    const f = faceFrame(mesh), { width: w, height: h, channels: ch } = image;
    const oval = CONTOURS.face_oval.map((i) => mesh[i]);
    const lip = at(mesh[13], mesh[14]), mouth = at(mesh[61], mesh[291]);
    const cheekL = at(mesh[234], mesh[1]), cheekR = at(mesh[454], mesh[1]);
    const browL = at(mesh[105], mesh[70]), browR = at(mesh[334], mesh[300]);
    const jawL = at(mesh[172], mesh[152]), jawR = at(mesh[397], mesh[152]);
    const iod = f.iod, magnitude = Math.abs(slider) / 100;
    // Broad photographic cues amplify Normal/Extra differences; edges are still fully feathered.
    const level = smooth((magnitude - 0.50) / 0.40), direction = Math.sign(slider);
    const low = lowLuma(image, Math.max(2, Math.min(8, Math.round(iod * 0.045))));
    const data = new Uint8Array(image.data);
    const xs = oval.map((p) => p[0]), ys = oval.map((p) => p[1]);
    const left = Math.max(0, Math.floor(Math.min(...xs))), right = Math.min(w - 1, Math.ceil(Math.max(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(h - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++) {
            if (!insidePolygon(x + 0.5, y + 0.5, oval))
                continue;
            const safeEdge = smooth(edgeDistance(x + 0.5, y + 0.5, oval) / Math.max(2, iod * 0.035));
            if (safeEdge <= 0)
                continue;
            const i = y * w + x, j = i * ch;
            const lighting = clamp(Math.pow(Math.max(12, low[i]) / 142, 0.58), 0.55, 1.25);
            const brow = ellipse(x, y, browL, iod * 0.38, iod * 0.17) + ellipse(x, y, browR, iod * 0.38, iod * 0.17);
            const jaw = ellipse(x, y, jawL, iod * 0.38, iod * 0.32) + ellipse(x, y, jawR, iod * 0.38, iod * 0.32);
            const cheeks = ellipse(x, y, cheekL, iod * 0.58, iod * 0.44) + ellipse(x, y, cheekR, iod * 0.58, iod * 0.44);
            const lips = ellipse(x, y, lip, Math.max(2, Math.hypot(mesh[61][0] - mesh[291][0], mesh[61][1] - mesh[291][1]) * 0.39), Math.max(1.2, Math.hypot(mesh[13][0] - mesh[14][0], mesh[13][1] - mesh[14][1]) * 0.9));
            const protectLips = 1 - clamp(lips * 1.2);
            const protectCentre = 1 - 0.75 * ellipse(x, y, mouth, iod * 0.24, iod * 0.34);
            const peak = (2.0 * magnitude + 24 * level) * lighting * safeEdge;
            let dr = 0, dg = 0, db = 0;
            if (direction > 0) {
                // Facial contours receive sculpted shadow, without fabricated hair texture.
                const dark = peak * (0.92 * brow + 0.72 * jaw) * protectLips * protectCentre;
                dr = -dark;
                dg = -dark * 0.99;
                db = -dark * 0.95;
            }
            else {
                // Cheek highlight and modest lip-chroma shift, preserving the original shading field.
                const light = peak * (0.92 * cheeks + 0.35 * jaw) * protectLips * protectCentre;
                const chroma = 4.2 * magnitude * lips * safeEdge;
                dr = light + 0.8 * chroma;
                dg = 0.92 * light + 0.15 * chroma;
                db = 0.79 * light - 0.25 * chroma;
            }
            const v = [dr, dg, db];
            for (let c = 0; c < 3; c++)
                data[j + c] = Math.round(clamp(image.data[j + c] + v[c], 0, 255));
        }
    return { ...image, data };
}
