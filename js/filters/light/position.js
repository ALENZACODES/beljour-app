/**
 * Position light: vignette, centre light and a top-to-bottom graded tint, mirroring
 * api/plumb_api/filters/light/position.py. Each pixel changes by where it sits in the whole
 * photo (the Frame), never by its neighbours, so these tile without a halo. Light is
 * multiplied in linear light; the graded tint pushes OKLab a, b.
 * Author: John Khan.
 */
import { angle, fixed, num, register } from "../colour/ops.js";
import { RAD, decode1, encode1, oklabToSrgb, smoothstep, srgbToOklab } from "../colour/space.js";
const HALF_DIAGONAL = Math.hypot(0.5, 0.5);
function each(block, frame, fn) {
    const out = Float64Array.from(block.data);
    for (let row = 0; row < block.height; row++) {
        const y = row + frame.y0 + 0.5;
        for (let col = 0; col < block.width; col++)
            fn(out, (row * block.width + col) * 3, col + frame.x0 + 0.5, y);
    }
    return { width: block.width, height: block.height, data: out };
}
export function vignetteFactor(p, frame, x, y) {
    const u = x / frame.width - 0.5, v = y / frame.height - 0.5;
    const d = Math.hypot(u, v) / HALF_DIAGONAL;
    const k = smoothstep(p.inner, p.outer, d);
    return Math.max(0, 1 - 0.6 * p.amount * k);
}
export function vignette(block, p, frame) {
    return each(block, frame, (d, i, x, y) => {
        const f = vignetteFactor(p, frame, x, y);
        for (let c = 0; c < 3; c++)
            d[i + c] = encode1(decode1(d[i + c]) * f);
    });
}
export function centrePoint(p, frame) {
    if (p.follow >= 0.5 && frame.faceCentre)
        return [frame.faceCentre[0], frame.faceCentre[1]];
    return [p.cx * frame.width, p.cy * frame.height];
}
export function centre(block, p, frame) {
    const [cx, cy] = centrePoint(p, frame);
    const reach = p.radius * Math.min(frame.width, frame.height);
    const amount = p.amount, warmth = p.warmth;
    return each(block, frame, (d, i, x, y) => {
        const g = 1 - smoothstep(0, 1, Math.hypot(x - cx, y - cy) / reach);
        const factor = 1 + 0.5 * amount * g;
        d[i] = encode1(decode1(d[i]) * (factor * (1 + 0.25 * warmth * g)));
        d[i + 1] = encode1(decode1(d[i + 1]) * factor);
        d[i + 2] = encode1(decode1(d[i + 2]) * (factor * (1 - 0.25 * warmth * g)));
    });
}
export function grade(block, p, frame) {
    const s = new Float64Array(3);
    const top = p.topHue * RAD, bottom = p.bottomHue * RAD;
    const ta = p.topAmount, ba = p.bottomAmount;
    return each(block, frame, (d, i, _x, y) => {
        const t = y / frame.height;
        srgbToOklab(d[i], d[i + 1], d[i + 2], s);
        const pt = ta * (1 - t), pb = ba * t;
        s[1] += pt * Math.cos(top);
        s[2] += pt * Math.sin(top);
        s[1] += pb * Math.cos(bottom);
        s[2] += pb * Math.sin(bottom);
        oklabToSrgb(s[0], s[1], s[2], s);
        d[i] = s[0];
        d[i + 1] = s[1];
        d[i + 2] = s[2];
    });
}
register({ name: "light.vignette", family: "light", skinHue: false, image: vignette,
    params: { amount: num(0, -1, 1, "darker edges +, lighter edges -"), inner: fixed(0.35, 0, 0.95), outer: fixed(1, 0.3, 1.5) },
    help: "Edge darkening by distance from the centre" });
register({ name: "light.centre", family: "light", skinHue: false, image: centre,
    params: { amount: num(0, 0, 1), warmth: num(0, -1, 1), radius: fixed(0.45, 0.1, 1.5), cx: fixed(0.5, 0, 1), cy: fixed(0.45, 0, 1),
        follow: fixed(0, 0, 1, "1 = follow the face centre when known") },
    help: "A pool of light around the face or a point" });
register({ name: "light.grade", family: "light", skinHue: true, image: grade,
    params: { topHue: angle(), topAmount: num(0, 0, 0.1), bottomHue: angle(), bottomAmount: num(0, 0, 0.1) },
    help: "A tint graded from the top of the photo to the bottom" });
