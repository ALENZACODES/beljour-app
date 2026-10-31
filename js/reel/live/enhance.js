/** #81 Video enhance: the existing local enhance pipeline on every frame, steadied over time.
 * Each frame goes through engines/local/enhance.ts (mode "natural"): its condition gate
 * decides per frame, so dark, noisy, blurred or faded frames get only their own rescue and
 * normal frames keep their pixels (and restart the smoothing). Because each frame is judged alone, the result can
 * flicker and keep some noise; temporal.ts PixelSmoother then averages still pixels with the
 * previous output (moving pixels take the new frame, so nothing ghosts). No learned model and
 * no upscaling; no detail is invented. Alpha is kept. Author: John Khan.
 */
import { enhance } from "../../engines/local/enhance.js";
import { copyFrame } from "./frames.js";
import { PixelSmoother } from "./temporal.js";
export const LABEL = "Video enhanced on this device, frame by frame; no detail is invented.";
export class VideoEnhance {
    id = "enhance";
    label = LABEL;
    pixels = new PixelSmoother();
    lastCondition = "";
    apply(frame, _inputs, strength) {
        if (strength === 0) {
            this.pixels.reset();
            return { image: copyFrame(frame.image), changed: false, note: "" };
        }
        const result = enhance(frame.image, "natural", { strength: strength / 100 });
        this.lastCondition = String(result.condition.primary);
        if (result.steps.unchanged) {
            this.pixels.reset();
            return { image: copyFrame(frame.image), changed: false, note: "Some frames needed no repair and were kept as filmed." };
        }
        const steady = this.pixels.smooth(result.image);
        const changed = steady.data.some((v, i) => v !== frame.image.data[i]);
        return { image: steady, changed, note: "" };
    }
    reset() { this.pixels.reset(); this.lastCondition = ""; }
}
