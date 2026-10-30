import { BACKDROPS, VideoBackground } from "./background.js";
import { LIVE_FILTERS, LiveArFilter } from "./ar-filters.js";
import { VideoEnhance } from "./enhance.js";
import { VideoRetouch } from "./retouch.js";
import { VideoAppearance } from "./appearance.js";
import { LensEffect } from "../../lenses/live.js";
import { LENSES } from "../../lenses/recipes.js";
export const BACKDROP_NAMES = [...Object.keys(BACKDROPS), "soft"];
export function backdropFor(name) {
    return name === "soft" ? { kind: "soft" } : { kind: "colour", name };
}
export const EFFECTS = [
    { id: "retouch", title: "Skin smoothing, texture kept", needsFace: true, needsPerson: false, make: () => new VideoRetouch() },
    { id: "background", title: "Background change", needsFace: false, needsPerson: true,
        make: (options = {}) => new VideoBackground(options.backdrop ?? { kind: "colour", name: "ivoire" }) },
    { id: "enhance", title: "Enhance (light, noise, fading)", needsFace: false, needsPerson: false, make: () => new VideoEnhance() },
    { id: "ar_filter", title: "Live filter", needsFace: true, needsPerson: false,
        make: (options = {}) => new LiveArFilter(options.filter ?? LIVE_FILTERS[0].id) },
    { id: "lens", title: "Face lens", needsFace: true, needsPerson: false,
        make: (options = {}) => new LensEffect(options.lens ?? LENSES[0].id, options.lensPictures, options.lensBeauty ?? true) },
    { id: "appearance", title: "Age and gender appearance", needsFace: true, needsPerson: false,
        make: (options = {}) => new VideoAppearance({ mode: options.appearance ?? "older" }) },
];
export function effectChoice(id) {
    const found = EFFECTS.find((e) => e.id === id);
    if (!found)
        throw new RangeError(`no video effect ${JSON.stringify(id)}`);
    return found;
}
//# sourceMappingURL=effects.js.map