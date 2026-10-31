/** Original filters, public local entry. No providers or I/O. Author: John Khan. */
import { regionMask } from "../../data/regions/index.js";
import { DEFAULTS as crownDefaults, meadowCrown } from "./crown.js";
import { DEFAULTS as inkDefaults, inkStudy } from "./ink.js";
import { DEFAULTS as oilDefaults, pigmentOil } from "./oil.js";
import { DEFAULTS as rainDefaults, rainExpression } from "./rain.js";
import { EffectUnavailable, landmarks, photo } from "./types.js";
export { EffectUnavailable, VERSION, MAX_PIXELS } from "./types.js";
export const EFFECTS = {
    "ink-study": { name: "Ink Study", row: 18, needs: ["hair_mask", "eye_mask"], defaults: inkDefaults },
    "pigment-oil": { name: "Pigment Oil", row: 21, needs: [], defaults: oilDefaults },
    "rain-expression": { name: "Rain Expression", row: 16, needs: ["landmarks"], defaults: rainDefaults },
    "meadow-crown": { name: "Meadow Crown", row: 15, needs: ["landmarks", "hair_mask"], defaults: crownDefaults },
};
export function renderArtistic(effectId, image, options = {}) {
    const src = photo(image);
    if (typeof effectId !== "string" || !Object.hasOwn(EFFECTS, effectId))
        throw new RangeError("unknown original artistic effect");
    if (effectId === "ink-study") {
        let eyes = options.eyeMask;
        if (eyes === undefined && options.landmarks !== undefined) {
            const points = landmarks(options.landmarks, src.width, src.height);
            eyes = regionMask("eyes", points, src.width, src.height, { normalized: false, supersample: 2 }).data;
            let coverage = 0;
            for (let i = 0; i < eyes.length; i++)
                coverage += eyes[i];
            if (coverage < 1)
                throw new EffectUnavailable("eyes_not_visible", "confirm an eye protection mask before the cel simulation");
        }
        return inkStudy(src, options.hairMask, eyes, options.params);
    }
    if (effectId === "pigment-oil")
        return pigmentOil(src, options.params);
    if (effectId === "rain-expression")
        return rainExpression(src, options.landmarks, options.params);
    return meadowCrown(src, options.landmarks, options.hairMask, options.params);
}
export { TimeWarpScan } from "./time-warp.js";
