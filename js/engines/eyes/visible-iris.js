import { irisColour, SHADES } from "./iris-colour.js";
const SIDES = ["right_iris", "left_iris"];
const MIN_SUPPORT = 12;
function unchanged(photo, hidden, missing) {
    return {
        image: Uint8ClampedArray.from(photo.data),
        alpha: new Float64Array(photo.width * photo.height),
        changed: 0, visibleIrises: 0,
        declaredNotVisible: hidden, undeclaredMissing: missing,
        reason: "iris_not_observed", eligible: false,
    };
}
function validKeys(value, label) {
    if (Object.keys(value).length !== SIDES.length
        || SIDES.some(side => !Object.hasOwn(value, side))) {
        throw new RangeError(`both observed ${label} keys are required`);
    }
}
/** All evidence is checked before a single pixel changes, including overlap. */
export function recolourVisible(photo, masks, states, shade = "hazel", strength = 65) {
    if (photo.channels !== 3 || !Number.isInteger(photo.width) || !Number.isInteger(photo.height)
        || Math.min(photo.width, photo.height) < 8
        || photo.data.length !== photo.width * photo.height * 3) {
        throw new RangeError("observed iris rendering requires uint8 RGB pixels");
    }
    for (let index = 0; index < photo.data.length; index++) {
        const value = photo.data[index];
        if (!Number.isInteger(value) || value < 0 || value > 255) {
            throw new RangeError("iris image must contain valid RGB bytes");
        }
    }
    if (!Object.hasOwn(SHADES, shade))
        throw new RangeError("unknown original iris shade");
    if (!Number.isFinite(strength) || strength < 0 || strength > 100) {
        throw new RangeError("strength must be finite in 0..100");
    }
    validKeys(masks, "iris mask");
    validKeys(states, "iris state");
    const count = photo.width * photo.height;
    const checked = {
        right_iris: new Float64Array(count), left_iris: new Float64Array(count),
    };
    for (const side of SIDES) {
        const mask = masks[side];
        if (mask.length !== count)
            throw new RangeError("iris mask dimensions must match the original");
        for (let index = 0; index < count; index++) {
            const value = mask[index];
            if (!Number.isFinite(value) || value < 0 || value > 1) {
                throw new RangeError("iris masks must contain finite alpha in 0..1");
            }
            checked[side][index] = value;
        }
    }
    const missing = [];
    const hidden = [];
    const visible = [];
    for (const side of SIDES) {
        const state = states[side];
        let support = 0;
        let populated = false;
        for (const alpha of checked[side]) {
            if (alpha >= 0.5)
                support++;
            if (alpha > 0)
                populated = true;
        }
        const name = side === "right_iris" ? "right" : "left";
        if (state === "not_visible:closed" || state === "not_visible:hidden_by_turn") {
            if (populated)
                missing.push(`${name}:inconsistent_hidden_mask`);
            else
                hidden.push(`${name}:${state.split(":")[1]}`);
        }
        else if (state !== "visible" || support < MIN_SUPPORT) {
            missing.push(`${name}:unobserved`);
        }
        else {
            visible.push(side);
        }
    }
    if (visible.length === 2) {
        for (let index = 0; index < count; index++) {
            if (checked.right_iris[index] >= 0.5 && checked.left_iris[index] >= 0.5) {
                missing.push("iris_masks_overlap");
                break;
            }
        }
    }
    if (missing.length || !visible.length)
        return unchanged(photo, hidden, missing);
    let image = Uint8ClampedArray.from(photo.data);
    const coverage = new Float64Array(count);
    let edited = 0;
    for (const side of visible) {
        const result = irisColour({ ...photo, data: image }, checked[side], shade, strength);
        if (!result.changed) {
            const prefix = side === "right_iris" ? "right" : "left";
            return unchanged(photo, hidden, [`${prefix}:no_edit`]);
        }
        image = Uint8ClampedArray.from(result.image);
        for (let index = 0; index < count; index++) {
            coverage[index] = Math.max(coverage[index], result.alpha[index]);
        }
        edited += result.changed;
    }
    return {
        image, alpha: coverage, changed: edited, visibleIrises: visible.length,
        declaredNotVisible: hidden, undeclaredMissing: [],
        reason: "measured_visible_iris", eligible: true,
    };
}
//# sourceMappingURL=visible-iris.js.map