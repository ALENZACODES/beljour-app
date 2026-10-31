/** The Studio's way into the photo-adjustment and crop panels, and the full-size save.
 * view.ts calls `editorScreen` for the five tools and `renderFullSize` (fullsize.ts) when she saves.
 * Author: John Khan.
 */
import { adjustScreen, mixerScreen } from "./panel.js";
import { curvesScreen } from "./curves-panel.js";
import { selectiveScreen } from "./selective-panel.js";
import { cropScreen } from "../crop/panel.js";
export { renderFullSize, savedLine } from "./fullsize.js";
export function editorScreen(kind, host) {
    if (kind === "adjust")
        return adjustScreen(host);
    if (kind === "mixer")
        return mixerScreen(host);
    if (kind === "curves")
        return curvesScreen(host);
    if (kind === "selective")
        return selectiveScreen(host);
    return cropScreen(host);
}
/** The largest photo the full-size save renders: 12.6 megapixels, so a standard 12 MP phone photo
 * (4032 x 3024 on iPhone, 4080 x 3072 on Pixel, 4000 x 3000 on most others) saves at its own full
 * size; larger photos (48 or 50 MP modes) are scaled to fit, to stay inside phone memory. ASSUMED. */
export const FULL_SIZE_PIXELS = 12_600_000;
/** Scale a width x height photo down to fit the full-size budget (never up). */
export function fullSizeFor(width, height) {
    const k = Math.min(1, Math.sqrt(FULL_SIZE_PIXELS / (width * height)));
    return { width: Math.max(1, Math.floor(width * k)), height: Math.max(1, Math.floor(height * k)) };
}
