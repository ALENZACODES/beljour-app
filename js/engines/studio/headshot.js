/** Headshot studio: her own photo with a conservative backdrop, a soft key light, a light
 * even-tone retouch and head-and-shoulders crops, per industry. Non-generative. Mirrors
 * api/plumb_api/engines/studio/headshot.py. Author: John Khan.
 */
import { isRefusal, renderSkinTool } from "../skin/studio.js";
import { renderBackdrop } from "./backdrops.js";
import { faceBox, finish, halfUp, personMask, photo } from "./common.js";
import { compose, foreground, refine } from "./matte.js";
import { applyLight } from "./relight.js";
export const FACE_SHARE = 0.42;
export const EYE_LINE = 0.40;
export const EYE_IN_FACE = 0.45;
export const CROPS = [["square", 1.0], ["portrait-4x5", 0.8]];
export const LABEL = "Headshot studio: drawn backdrop, lighting simulation and a light even-tone retouch of your own photo.";
const ROWS = [
    ["finance-law", "Finance and law", "chinon", 35, 20], ["technology", "Technology", "blois", 30, 15],
    ["healthcare", "Healthcare", "dinan", 25, 15], ["academic", "Academic and public sector", "saumur", 30, 15],
    ["creative", "Creative work", "cahors", 45, 10, "upper-right"],
];
export const INDUSTRIES = Object.freeze(Object.fromEntries(ROWS.map(([id, name, backdrop, light, retouch, side]) => [id, { id, name, backdrop, light, retouch, side: side ?? "upper-left" }])));
export function crops(box, width, height) {
    const [x0, y0, x1, y1] = box;
    const faceH = y1 - y0, eyeY = y0 + EYE_IN_FACE * faceH, cx = (x0 + x1) / 2;
    return CROPS.map(([name, aspect]) => {
        let ch = faceH / FACE_SHARE, cw = ch * aspect;
        const scale = Math.min(1, width / cw, height / ch);
        cw *= scale;
        ch *= scale;
        const left = Math.min(Math.max(0, cx - cw / 2), width - cw);
        const top = Math.min(Math.max(0, eyeY - EYE_LINE * ch), height - ch);
        return [name, halfUp(left), halfUp(top), halfUp(cw), halfUp(ch)];
    });
}
export function headshot(image, coarse, points, industry = "technology") {
    const style = INDUSTRIES[industry];
    if (!style)
        throw new RangeError(`industry must be one of ${Object.keys(INDUSTRIES).join(", ")}`);
    const p = photo(image);
    const person = personMask(coarse, p.width, p.height);
    const box = faceBox(points);
    const metrics = { tool: "headshot", industry, backdrop: style.backdrop };
    const retouched = renderSkinTool("tone", image, points, style.retouch, { redness: 50 });
    let base = p.rgb;
    if (isRefusal(retouched))
        Object.assign(metrics, { retouch: "skipped", retouch_reason: retouched.code });
    else {
        metrics.retouch = "even tone";
        base = new Float64Array(p.rgb.length);
        for (let i = 0; i < base.length / 3; i++)
            for (let k = 0; k < 3; k++)
                base[i * 3 + k] = retouched.image[i * image.channels + k];
    }
    const lit = applyLight(base, person, p.width, p.height, box, style.side, style.light / 100);
    const { alpha, metrics: matte } = refine(p.rgb, person, p.width, p.height);
    const out = finish(compose(foreground(lit.rgb, alpha, p.width, p.height), alpha, renderBackdrop(style.backdrop, p.width, p.height)), p.alpha);
    return { image: out.data, channels: out.channels, label: LABEL, crops: crops(box, p.width, p.height),
        metrics: { ...metrics, ...matte, gain_before_balance: lit.raw } };
}
