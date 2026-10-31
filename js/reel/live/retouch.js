/** #71 Video face retouch with live tracking: gentle, texture-kept skin smoothing per frame.
 * Face points come from the detector on each frame and are steadied with the existing One
 * Euro landmark smoothing (temporal.ts PointSmoother over reel/oneEuro.ts), so the skin mask
 * follows the face without shimmering. The smoothing itself is the local texture preview of
 * the Skin screen (screens/local-preview.ts texturePreview: a light box blur inside the visible
 * skin only), scaled by strength. A frame without a face is passed through unchanged and the
 * smoother restarts. Moles and marks are not removed (no healing runs here). Labelled
 * simulation; not medical advice. Author: John Khan.
 */
import { texturePreview } from "../../screens/local-preview.js";
import { copyFrame } from "./frames.js";
import { PointSmoother } from "./temporal.js";
export const LABEL = "Video skin smoothing, texture kept. A local simulation, not medical advice.";
export class VideoRetouch {
    id = "retouch";
    label = LABEL;
    points = new PointSmoother();
    lastPoints = null;
    apply(frame, inputs, strength) {
        if (!inputs.points || inputs.points.length !== 478) {
            this.points.reset();
            this.lastPoints = null;
            return { image: copyFrame(frame.image), changed: false, note: "No face on some frames; they were left unchanged." };
        }
        const steady = this.points.smooth(inputs.points, frame.t);
        this.lastPoints = steady;
        if (strength === 0)
            return { image: copyFrame(frame.image), changed: false, note: "" };
        return { image: texturePreview(frame.image, steady, strength / 100), changed: true, note: "" };
    }
    reset() { this.points.reset(); this.lastPoints = null; }
}
