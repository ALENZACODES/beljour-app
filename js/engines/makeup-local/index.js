import { applyFoundation, isFoundationRefusal } from "../shade/foundation.js";
import { findReliableShade, matchShades } from "../shade/finder.js";
import { MAKEUP_SHADES } from "../skin-measure/generated/guide.js";
import { measureSkin } from "../skin-measure/index.js";
import { examplePersonLook } from "../../screens/skin-moment-demo.js";
export const LIPS = MAKEUP_SHADES.lip;
export const BLUSHES = MAKEUP_SHADES.blush;
/** Her skin colour and the closest reference shades, never lighter than measured. The shade
 * engine's strict reading comes first; when it declines (uneven light between the cheeks, no
 * neutral reference), the skin reader's colour, balanced on the whites of her eyes, is used and
 * the result says it is an estimate. Refused only when neither can read the skin, with why. */
export function foundationChoices(image, points, top = 5) {
    const r = findReliableShade(image, points.map(([x, y]) => [x, y, 0])).result;
    if (!r.refused && r.measured_lab) {
        const measured = [r.measured_lab[0], r.measured_lab[1], r.measured_lab[2]];
        return { measured, shades: matchShades(measured).slice(0, top), estimate: false };
    }
    try {
        const measured = measureSkin(image, points).skin_lab;
        const shades = matchShades(measured).slice(0, top);
        if (shades.length)
            return { measured, shades, estimate: true };
    }
    catch { /* fall through to the strict engine's reason */ }
    return { refused: r.reason ?? "The skin colour couldn't be read reliably. Try even daylight." };
}
/** The chosen look drawn on the photo. Throws with a plain message when the face points leave no skin to draw on. */
export function drawLook(image, points, measured, choice) {
    let out = image;
    if (choice.foundation) {
        const r = applyFoundation(out, points.map(([x, y]) => [x, y, 0]), choice.foundation.lab, measured, choice.coverage ?? 45);
        if (isFoundationRefusal(r))
            throw new Error("The foundation couldn't be drawn on this face. Try a front-facing photo in even light.");
        out = { width: image.width, height: image.height, channels: image.channels, data: r.image };
    }
    const swatches = [choice.lip ? { category: "lip_color", color: choice.lip.hex } : null, choice.blush ? { category: "blush", color: choice.blush.hex } : null]
        .filter((x) => x !== null);
    if (swatches.length) {
        const look = examplePersonLook(out, points.map(([x, y]) => [x, y]), swatches);
        if (!look)
            throw new Error("The lip colour and blush couldn't be drawn on this face.");
        out = look;
    }
    return out;
}
//# sourceMappingURL=index.js.map