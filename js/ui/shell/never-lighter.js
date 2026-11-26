/**
 * Never lighter: the last step of every filter look in the Studio while the skin guard is on
 * (applied by the Studio pipeline and the preview strip; the filter engine itself is unchanged).
 * Inside the skin area, CIELAB L* may rise by at most NEVER_LIGHTER_DL over the photo before
 * the look (the shade engine's never-lighter allowance); a pixel above it keeps its a*, b* and
 * goes back down to the limit. The skin area is the face points' skin region, or, when a photo
 * has no face points, the same centred face ellipse the Still-you photo check reads. Darker
 * results and everything outside the skin area are left exactly as the look made them.
 * Author: John Khan.
 */
import { decode1, encode1, labToSrgb, srgbToLab } from "../../filters/colour/space.js";
import { masksFor, recipeFor } from "../../filters/runtime/layer.js";
export const NEVER_LIGHTER_DL = 1.0;
/** The centred face ellipse (layout/still-you.ts centralSkin), as plain weights. */
export function roughFaceArea(width, height) {
    const m = new Float64Array(width * height);
    const cx = width / 2, cy = height * 0.52, rx = 0.30 * width, ry = 0.38 * height;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            m[y * width + x] = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? 1 : 0;
        }
    return m;
}
/** RGB bytes in and out (3 per pixel). Returns the clamped copy and how many pixels moved. */
export function neverLighter(before, look, skin, allow = NEVER_LIGHTER_DL) {
    if (before.length !== look.length || skin.length * 3 !== look.length)
        throw new RangeError("never-lighter needs one size for photo, look and skin area");
    if (!(Number.isFinite(allow) && allow >= 0))
        throw new RangeError("allowance must be 0 or more");
    const out = Uint8Array.from(look);
    const sb = [0, 0, 0], sa = [0, 0, 0], g = [0, 0, 0];
    let clamped = 0;
    for (let p = 0; p < skin.length; p++) {
        const alpha = Math.min(1, 2 * skin[p]);
        if (!(alpha > 0))
            continue;
        const i = p * 3;
        const lb = srgbToLab(before[i] / 255, before[i + 1] / 255, before[i + 2] / 255, sb)[0];
        srgbToLab(look[i] / 255, look[i + 1] / 255, look[i + 2] / 255, sa);
        const limit = lb + allow;
        if (sa[0] <= limit)
            continue;
        labToSrgb(limit, sa[1], sa[2], g);
        for (let c = 0; c < 3; c++) {
            const ll = decode1(look[i + c] / 255), lg = decode1(Math.min(1, Math.max(0, g[c])));
            // Rounded down, so byte rounding can never land back above the limit.
            out[i + c] = Math.max(0, Math.min(255, Math.floor(encode1(ll + (lg - ll) * alpha) * 255 + 1e-9)));
        }
        clamped++;
    }
    return { data: out, clamped };
}
/** A filter look's Studio output with the never-lighter cap applied when its skin guard is on. */
export function guardFilterLook(before, look, source, parameters) {
    const recipe = recipeFor({ parameters });
    const on = typeof parameters.guard === "boolean" ? parameters.guard : recipe.defaults.guard !== false;
    if (!on || before.width !== look.width || before.height !== look.height)
        return { image: look, area: "off", clamped: 0 };
    const w = look.width, h = look.height, masks = masksFor(source);
    const skin = masks.skin && masks.skin.width === w && masks.skin.height === h ? masks.skin.data : roughFaceArea(w, h);
    const rgb = (img) => {
        if (img.channels === 3)
            return img.data instanceof Uint8Array ? img.data : Uint8Array.from(img.data);
        const out = new Uint8Array(w * h * 3);
        for (let p = 0; p < w * h; p++)
            for (let c = 0; c < 3; c++)
                out[p * 3 + c] = img.data[p * img.channels + c];
        return out;
    };
    const capped = neverLighter(rgb(before), rgb(look), skin);
    return { image: { width: w, height: h, channels: 3, data: capped.data }, area: skin === masks.skin?.data ? "face points" : "rough face area", clamped: capped.clamped };
}
//# sourceMappingURL=never-lighter.js.map