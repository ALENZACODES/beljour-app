/** #9 weight gain and #10 weight loss: face-only contour simulations built on the face width and
 * cheek fullness controls of the shape engine (geometry.ts, mirrored by geometry.py). Nothing
 * below the jaw is edited and no weight change is predicted. Weight loss is opt-in: it refuses
 * unless the person turned it on. Amount 0 returns an exact copy. The two shares below are
 * ASSUMED (chosen, not measured). Face-mapping inspiration: FLAME and DECA (face shape as a few
 * parametric controls); concept only, no code copied. Author: John Khan.
 */
import { requireColour } from "../core/buffer.js";
import { checkFace, renderShape } from "./geometry.js";
export const LABELS = Object.freeze({
    gain: "Weight gain simulation, face contour only. Not a prediction of how your face would change.",
    loss: "Weight loss simulation, face contour only. Not a prediction of how your face would change.",
});
/** Share of each shape control at amount 100. ASSUMED. */
export const MIX = Object.freeze({ face_width: 0.6, cheek_fullness: 1 });
export class FullnessRefusal extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function checkAmount(amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100) {
        throw new RangeError("amount must be 0 to 100");
    }
    return amount;
}
/** The shape control values for a direction and amount; amount 0 is no values at all. */
export function fullnessValues(direction, amount) {
    if (direction !== "gain" && direction !== "loss")
        throw new RangeError("direction must be gain or loss");
    const a = checkAmount(amount);
    if (a === 0)
        return {};
    const sign = direction === "gain" ? 1 : -1;
    return { face_width: sign * a * MIX.face_width, cheek_fullness: sign * a * MIX.cheek_fullness };
}
export function renderFullness(image, mesh, direction, amount, options = {}) {
    requireColour(image);
    checkFace(mesh);
    const values = fullnessValues(direction, amount);
    if (direction === "loss" && options.optedIn !== true) {
        throw new FullnessRefusal("not_opted_in", "Weight loss preview is off until you turn it on.");
    }
    if (Object.keys(values).length === 0) {
        return { image: { ...image, data: new Uint8Array(image.data) }, label: LABELS[direction], guardScale: 1, values };
    }
    const out = renderShape(image, mesh, values);
    return { image: out.image, label: LABELS[direction], guardScale: out.metrics.guard_scale, values };
}
//# sourceMappingURL=fullness.js.map