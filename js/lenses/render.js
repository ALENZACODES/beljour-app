import { requireColour } from "../engines/core/buffer.js";
import { fromLandmarks } from "../filters/masks/blend.js";
import { render as renderLook } from "../filters/runtime/engine.js";
import { texturePreview } from "../screens/local-preview.js";
import { faceFrame, place } from "./anchors.js";
import { drawnSprite } from "./fallbacks.js";
import { glassSprite } from "./glass.js";
import { beautyLook } from "./beauty.js";
import { applyEffect } from "./effects.js";
import { funWarp } from "./warps.js";
export const NO_PICTURES = () => null;
const copy = (image) => ({ ...image, data: new Uint8ClampedArray(image.data) });
/** Composite one sprite into `out` at `at`. Returns true if any pixel changed. */
export function composite(out, sprite, at, opacity, blend = "over", clip = 1) {
    if (!(opacity > 0) || !(at.halfW > 0.5) || !(at.halfH > 0.5))
        return false;
    const c = Math.cos(at.angle), s = Math.sin(at.angle), [cx, cy] = at.centre;
    const ex = Math.abs(c) * at.halfW + Math.abs(s) * at.halfH, ey = Math.abs(s) * at.halfW + Math.abs(c) * at.halfH;
    const x0 = Math.max(0, Math.floor(cx - ex)), x1 = Math.min(out.width - 1, Math.ceil(cx + ex));
    const y0 = Math.max(0, Math.floor(cy - ey)), y1 = Math.min(out.height - 1, Math.ceil(cy + ey));
    const side = sprite.side, src = sprite.data, ch = out.channels, data = out.data;
    const ku = side / (2 * at.halfW), kv = side / (2 * at.halfH);
    let changed = false;
    for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - cx;
            const sx = (dx * c + dy * s) * ku + side / 2 - 0.5, sy = (-dx * s + dy * c) * kv + side / 2 - 0.5;
            if (sx <= -1 || sy <= -1 || sx >= side || sy >= side)
                continue;
            // Below the clip line the prop fades out over 4% of its height.
            const keep = clip >= 1 ? 1 : Math.max(0, Math.min(1, (clip * side - sy) / (0.04 * side)));
            if (keep <= 0)
                continue;
            const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
            let a = 0, r = 0, g = 0, b = 0;
            for (let k = 0; k < 4; k++) {
                const px = ix + (k & 1), py = iy + (k >> 1);
                if (px < 0 || py < 0 || px >= side || py >= side)
                    continue;
                const w = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy), o = (py * side + px) * 4, sa = src[o + 3] / 255 * w;
                a += sa;
                r += src[o] * sa;
                g += src[o + 1] * sa;
                b += src[o + 2] * sa;
            }
            if (a <= 1e-4)
                continue;
            const rgb = [r / a, g / a, b / a], alpha = Math.min(1, a) * opacity * keep, i = (y * out.width + x) * ch;
            for (let q = 0; q < 3; q++) {
                const base = data[i + q];
                const target = blend === "multiply" ? base * rgb[q] / 255 : blend === "screen" ? 255 - (255 - base) * (255 - rgb[q]) / 255 : rgb[q];
                const v = Math.round(base + alpha * (target - base));
                if (v !== base) {
                    data[i + q] = v;
                    changed = true;
                }
            }
        }
    }
    return changed;
}
const glassCache = new WeakMap();
/** A glasses picture with see-through lenses, seeded at the two eyes (and a little below each,
 * where a gradient lens is lighter) mapped into the picture. Worked out once per picture. */
export function glassFor(sprite, frame, at) {
    const hit = glassCache.get(sprite);
    if (hit)
        return hit;
    const c = Math.cos(at.angle), s = Math.sin(at.angle), n = sprite.side;
    const seeds = [];
    for (const i of [468, 473]) {
        const dx = frame.points[i][0] - at.centre[0], dy = frame.points[i][1] - at.centre[1];
        const sx = (dx * c + dy * s) * n / (2 * at.halfW) + n / 2, sy = (-dx * s + dy * c) * n / (2 * at.halfH) + n / 2;
        seeds.push([sx, sy], [sx, sy + 0.1 * n]);
    }
    const made = glassSprite(sprite, seeds).sprite;
    glassCache.set(sprite, made);
    return made;
}
function triggered(frame, trigger) {
    return trigger === "mouth-open" ? frame.mouthOpen : trigger === "brow-raise" ? frame.browRaise : false;
}
/** A fixed pseudo-random number in [0, 1) for particle `i` of a lens (no state, no clock). */
export function rand(seed, i, k) {
    let h = (seed ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca77)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 2 ** 32;
}
const frac = (x) => x - Math.floor(x);
const seedOf = (id) => [...id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
/** Where each particle is at time t, in face widths from the face centre along the face axes. */
export function particleSpots(p, lensId, t, boosted) {
    const seed = seedOf(`${lensId}/${p.name}`), n = Math.min(80, p.count * (boosted ? 2 : 1)), out = [];
    for (let i = 0; i < n; i++) {
        const r1 = rand(seed, i, 1), r2 = rand(seed, i, 2), r3 = rand(seed, i, 3);
        let x, y, opacity = 1, turn = r3 * 360;
        if (p.motion === "fall" || p.motion === "rise") {
            const travel = frac(r2 + t * p.speed) * 2.4 - 1.2;
            x = (r1 - 0.5) * p.spread + 0.05 * Math.sin(2 * Math.PI * (t * 0.3 + r3));
            y = p.motion === "fall" ? travel : -travel;
            turn += t * 80 * (r1 - 0.5);
        }
        else if (p.motion === "orbit") {
            const ang = 2 * Math.PI * (r1 + t * p.speed * (r2 > 0.5 ? 1 : -1)), rad = 0.8 + 0.3 * r3;
            x = Math.cos(ang) * rad * p.spread / 2;
            y = -0.25 + Math.sin(ang) * rad * 0.45;
            turn = 20 * Math.sin(2 * Math.PI * (t + r1));
        }
        else {
            const ang = 2 * Math.PI * i / n + r1 * 0.4;
            x = Math.cos(ang) * p.spread / 2;
            y = -0.35 + Math.sin(ang) * p.spread * 0.35;
            opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t * p.speed + r2)));
        }
        out.push({ offset: [x, y], size: p.size * (0.65 + 0.7 * r3), turn, opacity, alt: !!p.alt && i % 2 === 1 });
    }
    return out;
}
function beautyPass(image, points, lens, share) {
    const beauty = lens.beauty;
    if (!beauty || share <= 0)
        return copy(image);
    let out = copy(image);
    if (beauty.look) {
        const looked = renderLook(out, beauty.look, { strength: Math.round(100 * share * (beauty.lookShare ?? 0.5)) }, fromLandmarks(points, image.width, image.height)).image;
        for (let i = 0; i < image.width * image.height; i++)
            for (let k = 0; k < 3; k++)
                out.data[i * out.channels + k] = looked.data[i * 3 + k];
    }
    if (beauty.smooth)
        out = texturePreview(out, points, Math.min(1, beauty.smooth / 100 * share));
    return out;
}
/** Draw `lens` on `image` with the face `points` (478, pixels). */
export function applyLens(image, points, lens, strength, options = {}) {
    requireColour(image);
    if (!(strength >= 0 && strength <= 100))
        throw new RangeError("strength must be 0..100");
    const frame = faceFrame(points);
    if (!frame || strength === 0)
        return { image: copy(image), changed: false, drawn: 0, frame };
    const share = strength / 100, t = options.t ?? 0, sprites = options.sprites ?? NO_PICTURES;
    let out = options.beauty === false ? copy(image) : beautyPass(image, frame.points, lens, share);
    let passes = 0; // warp, makeup and effect passes that ran (props and particles are counted below)
    if (lens.warp) {
        out = funWarp(out, frame, lens.warp.kind, Math.min(1, lens.warp.amount * share)).image;
        passes++;
    }
    if (lens.makeup) {
        out = beautyLook(out, frame.points, frame, lens.makeup, share, options.beauty !== false, options.precise !== false);
        passes++;
    }
    if (lens.effect) {
        out = applyEffect(out, frame, lens.effect, share, t, options.person ?? null);
        passes++;
    }
    const spriteFor = (name, draw) => sprites(`${lens.id}/${name}.png`) ?? drawnSprite(draw);
    let drawn = passes;
    for (const layer of lens.layers) {
        if (layer.when && !triggered(frame, layer.when))
            continue;
        const bob = layer.bob ? layer.bob[0] * Math.sin(2 * Math.PI * t / layer.bob[1]) : 0;
        const picture = sprites(`${lens.id}/${layer.name}.png`);
        const offset = (picture && layer.art?.offset) || layer.offset, scale = (picture && layer.art?.scale) || layer.scale;
        const at = place(frame, layer.anchor, [offset[0], offset[1] + bob], scale, layer.turn ?? 0, layer.depth ?? 0);
        const sprite = picture ? (layer.glass ? glassFor(picture, frame, at) : picture) : drawnSprite(layer.draw);
        if (composite(out, sprite, at, (layer.opacity ?? 1) * share, layer.blend, (picture && layer.art?.clip) || 1))
            drawn++;
    }
    for (const p of lens.particles ?? []) {
        const main = spriteFor(p.name, p.draw), alt = p.alt ? spriteFor(p.alt.name, p.alt.draw) : main;
        for (const spot of particleSpots(p, lens.id, t, triggered(frame, p.boost))) {
            const at = place(frame, "face", spot.offset, spot.size, spot.turn, 0);
            if (composite(out, spot.alt ? alt : main, at, spot.opacity * share))
                drawn++;
        }
    }
    return { image: out, changed: true, drawn, frame };
}
//# sourceMappingURL=render.js.map