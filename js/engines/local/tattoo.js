import { delaunay, signedArea } from "../warp/triangulate.js";
import { regionMask, regionStates } from "../../data/regions/index.js";
import { symmetricFace } from "./face-synthetic.js";
export const LABEL = "Tattoo try-on: a local simulation of your own art on your skin. Not a stencil or a skin check.";
/** Zones by face landmark (anatomical index); the side shown to her comes from where the anchor
 * sits in her photo, so a mirrored selfie is named correctly. */
export const ZONES = {
    forehead: { anchor: 151, part: "Forehead" },
    cheek_a: { anchor: 50, part: "Cheek" },
    cheek_b: { anchor: 280, part: "Cheek" },
    temple_a: { anchor: 139, part: "Temple" },
    temple_b: { anchor: 368, part: "Temple" },
    jaw_a: { anchor: 172, part: "Jaw" },
    jaw_b: { anchor: 397, part: "Jaw" },
};
export const WHITE_KEY = 235; // art pixels lighter than this, with little colour, count as background; ASSUMED
export const MAX_ART_SIDE = 1024;
export class TattooRefused extends RangeError {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export const DEFAULT_PLACEMENT = { zone: "cheek_a", size: 0.45, angle: 0, opacity: 0.85 };
/** "Cheek (photo left)": the zone's part and the side of the photo it is on, from her face points. */
export function zoneLabel(zone, face) {
    const z = ZONES[zone];
    if (zone === "forehead" || !face || face.length < 478)
        return z.part;
    const centre = (face[234][0] + face[454][0]) / 2;
    return `${z.part} (photo ${face[z.anchor][0] < centre ? "left" : "right"})`;
}
const REF_W = 1000, REF_H = 1000;
let reference = null;
function ref() {
    if (!reference) {
        const points = symmetricFace(REF_W, REF_H, 550, 660);
        reference = { points, triangles: delaunay(points), iod: Math.hypot(points[473][0] - points[468][0], points[473][1] - points[468][1]) };
    }
    return reference;
}
/** RGBA art with a real alpha channel; opaque art has its near-white background keyed out. */
export function prepareArt(art) {
    if (!(art.width >= 4 && art.height >= 4 && art.width <= MAX_ART_SIDE && art.height <= MAX_ART_SIDE && art.data.length === art.width * art.height * 4)) {
        throw new TattooRefused("bad_art", `Use a PNG, WebP or JPEG design between 4 and ${MAX_ART_SIDE} pixels a side.`);
    }
    const data = Uint8ClampedArray.from(art.data);
    let opaque = true;
    for (let p = 0; p < art.width * art.height; p++)
        if (data[p * 4 + 3] < 255) {
            opaque = false;
            break;
        }
    if (opaque)
        for (let p = 0; p < art.width * art.height; p++) {
            const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
            const light = Math.min(r, g, b), chroma = Math.max(r, g, b) - light;
            if (chroma < 24)
                data[p * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (WHITE_KEY + 12 - light) / 24)));
        }
    let ink = 0;
    for (let p = 0; p < art.width * art.height; p++)
        if (data[p * 4 + 3] > 16)
            ink++;
    if (!ink)
        throw new TattooRefused("bad_art", "This design has nothing to ink once its background is removed.");
    return { width: art.width, height: art.height, data };
}
export function checkPlacement(p) {
    if (!(p.zone in ZONES) || !(p.size >= 0.15 && p.size <= 1.2) || !(p.angle >= -45 && p.angle <= 45) || !(p.opacity >= 0.2 && p.opacity <= 1)) {
        throw new TattooRefused("bad_placement", "Size is 0.15 to 1.2 of your eye distance, turn -45 to 45 degrees, opacity 20 to 100%.");
    }
    return p;
}
/** Where a reference-face point lands in the art (u, v in 0..1), or null outside the design. */
function artUV(x, y, p, art) {
    const r = ref();
    const [ax, ay] = r.points[ZONES[p.zone].anchor];
    const w = p.size * r.iod, h = w * art.height / art.width;
    const a = -p.angle * Math.PI / 180, dx = x - ax, dy = y - ay;
    const u = (Math.cos(a) * dx - Math.sin(a) * dy) / w + 0.5, v = (Math.sin(a) * dx + Math.cos(a) * dy) / h + 0.5;
    return u >= 0 && u < 1 && v >= 0 && v < 1 ? [u, v] : null;
}
/** The design's corners on the reference face, as a box (for skipping triangles it can't touch). */
function footprint(p, art) {
    const r = ref();
    const [ax, ay] = r.points[ZONES[p.zone].anchor];
    const w = p.size * r.iod, h = w * art.height / art.width, a = p.angle * Math.PI / 180;
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => [ax + Math.cos(a) * u * w - Math.sin(a) * v * h, ay + Math.sin(a) * u * w + Math.cos(a) * v * h]);
    return { x0: Math.min(...corners.map((c) => c[0])), x1: Math.max(...corners.map((c) => c[0])),
        y0: Math.min(...corners.map((c) => c[1])), y1: Math.max(...corners.map((c) => c[1])) };
}
function sample(art, u, v) {
    const x = Math.min(art.width - 1, Math.floor(u * art.width)), y = Math.min(art.height - 1, Math.floor(v * art.height));
    const o = (y * art.width + x) * 4;
    return [art.data[o], art.data[o + 1], art.data[o + 2], art.data[o + 3]];
}
/** Ink her art onto the photo along her face mesh. `confirmed` is her "this art is mine to use". */
export function renderTattoo(image, face, artIn, placement, confirmed) {
    if (!confirmed)
        throw new TattooRefused("not_her_art", "Confirm the design is yours, or that you have the right to use it, first.");
    if (!face || face.length < 478)
        throw new TattooRefused("no_face_points", "Read face points on this device first; the design follows them.");
    if (image.channels !== 3 && image.channels !== 4)
        throw new TattooRefused("bad_art", "The photo must be RGB or RGBA.");
    const art = prepareArt(artIn), p = checkPlacement(placement), r = ref();
    const { width: W, height: H, channels: C } = image;
    // A side zone whose eye the face regions declare hidden by the head turn is turned away as a
    // whole: ink there would only come from triangles straddling the silhouette.
    if (p.zone !== "forehead") {
        const eye = p.zone.endsWith("_a") ? "right_eye" : "left_eye";
        if (regionStates(face, W, H, [eye], { normalized: false, supersample: 2 })[eye] === "not_visible:hidden_by_turn") {
            throw new TattooRefused("nothing_visible", "That side of your face is turned away from the camera in this photo. Try the other side or the forehead.");
        }
    }
    const skin = regionMask("skin", face, W, H, { normalized: false, supersample: 2 }).data;
    const out = Uint8Array.from(image.data);
    let inked = 0, hidden = 0;
    const foot = footprint(p, art);
    // A mirrored photo reverses every triangle; facing is judged against her mesh's own orientation.
    let total = 0, refTotal = 0;
    for (const [i, j, k] of r.triangles) {
        total += signedArea(face[i], face[j], face[k]);
        refTotal += signedArea(r.points[i], r.points[j], r.points[k]);
    }
    const flip = Math.sign(total) === Math.sign(refTotal) ? 1 : -1;
    for (const [i, j, k] of r.triangles) {
        const A = face[i], B = face[j], D = face[k];
        const ra = r.points[i], rb = r.points[j], rd = r.points[k];
        const refArea = signedArea(ra, rb, rd), area = signedArea(A, B, D);
        if (Math.abs(refArea) < 1e-9)
            continue;
        if (Math.max(ra[0], rb[0], rd[0]) < foot.x0 || Math.min(ra[0], rb[0], rd[0]) > foot.x1 ||
            Math.max(ra[1], rb[1], rd[1]) < foot.y0 || Math.min(ra[1], rb[1], rd[1]) > foot.y1)
            continue;
        if (Math.sign(area) * flip !== Math.sign(refArea) || Math.abs(area) < 1e-6) {
            hidden++;
            continue;
        }
        const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], D[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], D[0])));
        const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], D[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], D[1])));
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const P = [x + 0.5, y + 0.5];
                const wa = signedArea(B, D, P) / area, wb = signedArea(D, A, P) / area, wd = 1 - wa - wb;
                if (wa < -1e-9 || wb < -1e-9 || wd < -1e-9)
                    continue;
                const q = y * W + x;
                if (skin[q] <= 0)
                    continue;
                const uv = artUV(wa * ra[0] + wb * rb[0] + wd * rd[0], wa * ra[1] + wb * rb[1] + wd * rd[1], p, art);
                if (!uv)
                    continue;
                const [ir, ig, ib, ia] = sample(art, uv[0], uv[1]);
                const alpha = (ia / 255) * p.opacity * Math.min(1, skin[q]);
                if (alpha <= 0)
                    continue;
                for (let c = 0; c < 3; c++) {
                    const base = image.data[q * C + c], ink = [ir, ig, ib][c];
                    out[q * C + c] = Math.round(base + alpha * (base * ink / 255 - base));
                }
                inked++;
            }
    }
    if (!inked)
        throw new TattooRefused("nothing_visible", "That placement lands on no visible skin in this photo. Try another zone or a smaller size.");
    return { image: { width: W, height: H, channels: C, data: out }, inked, hiddenTriangles: hidden, label: LABEL, zone: zoneLabel(p.zone, face) };
}
