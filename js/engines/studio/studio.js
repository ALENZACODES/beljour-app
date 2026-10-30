/** One entry point for the local photo studio tools (blur 57, replace 58/68, remove 58,
 * relight, headshot 62, authentic 63). Every tool throws StudioRefusal (coded) instead of
 * returning a guessed picture. Mirrors api/plumb_api/engines/studio/studio.py. Author: John Khan.
 */
import { authenticity } from "./authentic.js";
import { backgroundBlur } from "./blur.js";
import { headshot } from "./headshot.js";
import { remove, replace } from "./matte.js";
import { relight } from "./relight.js";
export const TOOLS = ["blur", "replace", "remove", "relight", "headshot", "authentic"];
export function renderStudio(tool, image, person, points, o = {}) {
    const amount = o.strength ?? 60;
    if (tool === "blur")
        return backgroundBlur(image, person, amount);
    if (tool === "replace")
        return replace(image, person, o.backdrop ?? "chinon");
    if (tool === "remove")
        return remove(image, person);
    if (tool === "relight")
        return relight(image, person, points, o.side ?? "upper-left", amount);
    if (tool === "headshot")
        return headshot(image, person, points, o.industry ?? "technology");
    if (tool === "authentic")
        return authenticity(image, person, points, amount);
    throw new RangeError(`tool must be one of ${TOOLS.join(", ")}`);
}
//# sourceMappingURL=studio.js.map