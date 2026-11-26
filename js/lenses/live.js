import { copyFrame } from "../reel/live/frames.js";
import { PointSmoother } from "../reel/live/temporal.js";
import { LENSES, lensById } from "./recipes.js";
import { NO_PICTURES, applyLens } from "./render.js";
export const LABEL = "Face lens: our own drawn props that follow the face. A simulation.";
export class LensEffect {
    sprites;
    beauty;
    id = "lens";
    label = LABEL;
    lens;
    points = new PointSmoother();
    lastPoints = null;
    constructor(lensId = LENSES[0].id, sprites = NO_PICTURES, beauty = true) {
        this.sprites = sprites;
        this.beauty = beauty;
        this.lens = lensById(lensId);
    }
    apply(frame, inputs, strength) {
        if (!inputs.points || inputs.points.length !== 478) {
            this.points.reset();
            this.lastPoints = null;
            return { image: copyFrame(frame.image), changed: false, note: "No face on some frames; they were left unchanged." };
        }
        const pts = this.points.smooth(inputs.points, frame.t);
        this.lastPoints = pts;
        const result = applyLens(frame.image, pts, this.lens, strength, { t: frame.t, sprites: this.sprites, beauty: this.beauty, person: inputs.person });
        return { image: result.image, changed: result.changed, note: "" };
    }
    reset() { this.points.reset(); this.lastPoints = null; }
}
//# sourceMappingURL=live.js.map