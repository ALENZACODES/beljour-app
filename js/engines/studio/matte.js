/** Background remove and replace: her person area refined into a soft matte with a guided
 * filter in a band around the coarse edge, edge colours decontaminated, then her on a
 * procedural backdrop or on a transparent background. Mirrors
 * api/plumb_api/engines/studio/matte.py. Author: John Khan.
 */
import { BACKDROPS, renderBackdrop } from "./backdrops.js";
import { box, changedShare, finish, grey, guided, personMask, photo, radiusFor, weightedBlur } from "./common.js";
export const BAND_SHARE = 1 / 100;
export const EPS = 1e-2;
export const LABEL_REPLACE = "Background replaced with a drawn backdrop. Your photo itself is unchanged.";
export const LABEL_REMOVE = "Background removed. Your photo itself is unchanged.";
export function refine(rgb, coarse, width, height) {
    const band = radiusFor(width, height, BAND_SHARE);
    const near = box(coarse, width, height, band);
    const soft = guided(grey(rgb), coarse, width, height, band, EPS);
    const alpha = new Float64Array(coarse.length);
    let edges = 0, sum = 0;
    for (let i = 0; i < alpha.length; i++) {
        if (near[i] >= 0.999)
            alpha[i] = 1;
        else if (near[i] <= 0.001)
            alpha[i] = 0;
        else {
            alpha[i] = Math.min(1, Math.max(0, soft[i]));
            edges++;
        }
        sum += alpha[i];
    }
    return { alpha, metrics: { edge_band_px: band, edge_pixels: edges, alpha_mean: sum / alpha.length } };
}
export function foreground(rgb, alpha, width, height) {
    const clear = new Float64Array(alpha.length);
    for (let i = 0; i < alpha.length; i++)
        clear[i] = alpha[i] <= 0.02 ? 1 : 0;
    const old = weightedBlur(rgb, clear, width, height, radiusFor(width, height, BAND_SHARE * 2));
    const out = new Float64Array(rgb.length);
    for (let i = 0; i < alpha.length; i++) {
        const a = alpha[i];
        for (let k = 0; k < 3; k++) {
            const j = i * 3 + k;
            out[j] = a >= 0.98 ? rgb[j] : Math.min(255, Math.max(0, (rgb[j] - (1 - a) * old[j]) / Math.max(a, 0.05)));
        }
    }
    return out;
}
export function compose(front, alpha, back) {
    const out = new Float64Array(front.length);
    for (let i = 0; i < alpha.length; i++)
        for (let k = 0; k < 3; k++)
            out[i * 3 + k] = alpha[i] * front[i * 3 + k] + (1 - alpha[i]) * back[i * 3 + k];
    return out;
}
export function inside(alpha) {
    return alpha.map((a) => (a >= 0.999 ? 1 : 0));
}
export function replace(image, coarse, backdrop) {
    const p = photo(image);
    if (!BACKDROPS[backdrop])
        throw new RangeError(`unknown backdrop ${backdrop}`);
    const { alpha, metrics } = refine(p.rgb, personMask(coarse, p.width, p.height), p.width, p.height);
    const out = finish(compose(foreground(p.rgb, alpha, p.width, p.height), alpha, renderBackdrop(backdrop, p.width, p.height)), p.alpha);
    return { image: out.data, channels: out.channels, label: LABEL_REPLACE, crops: [],
        metrics: { ...metrics, backdrop, tool: "replace", person_changed_share: changedShare(p.rgb, out.data, out.channels, inside(alpha)) } };
}
export function remove(image, coarse) {
    const p = photo(image);
    const refined = refine(p.rgb, personMask(coarse, p.width, p.height), p.width, p.height);
    const alpha = p.alpha ? refined.alpha.map((a, i) => a * (p.alpha[i] / 255)) : refined.alpha;
    const rgb = finish(foreground(p.rgb, alpha, p.width, p.height), null).data;
    const out = new Uint8Array(alpha.length * 4);
    for (let i = 0; i < alpha.length; i++) {
        for (let k = 0; k < 3; k++)
            out[i * 4 + k] = rgb[i * 3 + k];
        const v = alpha[i] * 255, f = Math.floor(v), d = v - f;
        out[i * 4 + 3] = Math.min(255, d > 0.5 || (d === 0.5 && f % 2 === 1) ? f + 1 : f);
    }
    return { image: out, channels: 4, label: LABEL_REMOVE, crops: [], metrics: { ...refined.metrics, tool: "remove" } };
}
//# sourceMappingURL=matte.js.map