import { renderLayers } from "../../ui/shell/pipeline.js";
import { appearanceStackReport } from "../../ui/shell/appearance-stack.js";
import { copyFrame } from "./frames.js";
import { PointSmoother } from "./temporal.js";
export const LABEL = "Video appearance simulation (age, gender). Not a prediction of age, sex or gender identity.";
export const APPEARANCE_MODES = [
    { id: "older", title: "Older" }, { id: "younger", title: "Younger" }, { id: "gender", title: "Masculine or feminine" },
    { id: "gender_older", title: "Masculine or feminine, and older" }, { id: "gender_younger", title: "Masculine or feminine, and younger" },
];
function layer(kind, params, strength) {
    return { id: `video-${kind}`, kind, name: kind, enabled: true, opacity: 1, strength, parameters: params,
        provenance: "local", simulation: true, origin: "photo" };
}
/** The editor layers for a mode, as the stills would have them. */
export function appearanceLayers(settings, strength) {
    const { mode, stop = 2, slider = 33 } = settings;
    if (!APPEARANCE_MODES.some((m) => m.id === mode))
        throw new RangeError("unknown video appearance");
    if (!Number.isFinite(slider) || slider < -100 || slider > 100)
        throw new RangeError("Appearance direction must be -100 to 100.");
    const out = [];
    if (mode.startsWith("gender"))
        out.push(layer("gender", { slider }, strength));
    if (mode.endsWith("older"))
        out.push(layer("older", { stop }, strength));
    if (mode.endsWith("younger"))
        out.push(layer("younger", { stop: Math.min(3, stop) }, strength));
    return out;
}
export class VideoAppearance {
    settings;
    id = "appearance";
    label = LABEL;
    points = new PointSmoother();
    lastPoints = null;
    constructor(settings = { mode: "older" }) {
        this.settings = settings;
        appearanceLayers(settings, 50);
    }
    apply(frame, inputs, strength) {
        if (!inputs.points || inputs.points.length !== 478) {
            this.reset();
            return { image: copyFrame(frame.image), changed: false, note: "No face on some frames; they were left unchanged." };
        }
        const steady = this.points.smooth(inputs.points, frame.t);
        this.lastPoints = steady;
        if (strength === 0)
            return { image: copyFrame(frame.image), changed: false, note: "" };
        const source = { id: "video-frame", label: "Video frame", kind: "uploaded", image: frame.image, face: steady, disposable: true };
        const layers = appearanceLayers(this.settings, strength);
        const rendered = renderLayers(source, layers).image;
        const check = appearanceStackReport(source, layers, rendered);
        if (!check.passed)
            return { image: copyFrame(frame.image), changed: false, note: "A frame failed the appearance check and was left unchanged." };
        // The pipeline works in RGB; the frame keeps its own alpha byte for byte.
        const image = copyFrame(frame.image), c = image.channels;
        for (let i = 0; i < image.width * image.height; i++)
            for (let k = 0; k < 3; k++)
                image.data[i * c + k] = rendered.data[i * rendered.channels + k];
        return { image, changed: check.changedPixels > 0, note: "" };
    }
    reset() { this.points.reset(); this.lastPoints = null; }
}
//# sourceMappingURL=appearance.js.map