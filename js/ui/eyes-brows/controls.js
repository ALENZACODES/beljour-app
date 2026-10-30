const LENGTH = { key: "length", label: "Extension length / eye width", min: .02, max: .4, step: .01, initial: .14,
    help: "Relative drawing scale, not a millimetre prescription." };
const CURL = { key: "curl", label: "Curl", min: 0, max: 1, step: .05, initial: .6,
    help: "A procedural curve; natural lash lift retains each traced arc length." };
const THICKNESS = { key: "thickness", label: "Line width / eye width", min: .002, max: .05, step: .002, initial: .012,
    help: "Does not grow automatically when the liner contrast is low." };
const BLEND = { key: "blend", label: "Blend", min: 0, max: 1, step: .05, initial: .5,
    help: "Softens the simulated pigment boundary within its support." };
const TRANSPARENCY = { key: "transparency", label: "Base transparency", min: 0, max: 1, step: .05, initial: .3,
    help: "Digital pigment assumption. Real products vary." };
const DENSITY = { key: "density", label: "Pigment coverage", min: 0, max: .75, step: .05, initial: .35,
    help: "Capped drawing density. This is not a retained-pigment prediction." };
export const CONTROLS = {
    W59: [LENGTH, CURL],
    W60: [LENGTH, CURL],
    W61: [CURL],
    W62: [LENGTH, CURL],
    W63: [{ key: "smudge", label: "Smudge state", min: 0, max: 1, step: .05, initial: 0,
            help: "A local illustration of transfer, not a product wear test." }],
    W64: [LENGTH, THICKNESS],
    W65: [THICKNESS, BLEND],
    W66: [BLEND, TRANSPARENCY],
    W67: [TRANSPARENCY],
    W69: [{ key: "greyResistance", label: "Assumed grey-hair resistance", min: 0, max: 1, step: .05, initial: .65,
            help: "Higher resistance retains more of the measured grey hair." }],
    W70: [{ key: "angle", label: "Requested hair flow angle", min: 0, max: 85, step: 5, initial: 50,
            help: "Short or sparse observed hairs limit the result." }],
    W71: [DENSITY],
    W72: [DENSITY],
    W73: [
        { key: "arch", label: "Arch adjustment / brow width", min: -.05, max: .15, step: .01, initial: 0, help: "A separate guide, not a lift." },
        { key: "peak", label: "Arch peak along brow", min: .35, max: .8, step: .01, initial: .6, help: "Your existing asymmetry is retained." },
        { key: "tail", label: "Tail adjustment / brow width", min: -.05, max: .2, step: .01, initial: 0, help: "Changing the guide does not remove brow hairs." },
        { key: "thickness", label: "Guide thickness", min: 1, max: 1.6, step: .05, initial: 1, help: "The minimum retains the original width; automatic thinning is unavailable." },
    ],
    W74: [
        { key: "months", label: "Scenario months", min: 0, max: 12, step: 1, initial: 6, help: "Hypothetical timetable selected by you." },
        { key: "lengthChange", label: "Assumed final length change (%)", min: -20, max: 30, step: 1, initial: 0, help: "Zero by default. No typical or promised growth is assumed." },
        { key: "densityChange", label: "Assumed final density change (%)", min: -20, max: 30, step: 1, initial: 0, help: "Illustrative scenario only; not evidence that a product works." },
        { key: "baselineLength", label: "Your measured baseline length", min: .1, max: 30, step: .1, initial: 5, help: "Assumed until you enter your own measurement, in millimetres." },
        { key: "baselineDensity", label: "Your baseline count / fixed area", min: 0, max: 1000, step: 1, initial: 0, help: "Compare the same area and method over time. The photo is unchanged." },
    ],
    W76: [THICKNESS],
    "eye-makeup": [
        { key: "shadow", label: "Eyeshadow amount", min: 0, max: 1, step: .05, initial: 1, help: "Zero leaves the eyeshadow out." },
        { key: "liner", label: "Liner amount", min: 0, max: 1, step: .05, initial: 1, help: "Zero leaves the liner out. The line never thickens on its own." },
        { key: "mascara", label: "Mascara amount", min: 0, max: 1, step: .05, initial: 1, help: "Coats only the lashes you traced; no lash is invented." },
    ],
    "ink-study": [
        { key: "levels", label: "Cel levels", min: 2, max: 12, step: 1, initial: 5, help: "Protected hair and eye pixels keep their exact colour." },
        { key: "ink", label: "Ink strength", min: 0, max: 1, step: .05, initial: .65, help: "Edges are measured from your photo." },
        { key: "shadow", label: "Flat shade", min: 0, max: .6, step: .05, initial: .18, help: "Shading changes colour without moving the face." },
    ],
    "pigment-oil": [
        { key: "radius", label: "Paint neighbourhood radius", min: 1, max: 8, step: 1, initial: 3, help: "Larger radii simplify detail and take longer." },
        { key: "texture", label: "Paint texture", min: 0, max: .5, step: .02, initial: .18, help: "Original deterministic texture is visible at full preview size." },
        { key: "brush_angle", label: "Brush angle (radians)", min: -3.14, max: 3.14, step: .1, initial: -.4, help: "Changes texture direction, not face proportions." },
    ],
    "rain-expression": [
        { key: "expression", label: "Expression warp", min: 0, max: 1, step: .05, initial: .65, help: "Bounded brow and mouth-corner displacement." },
        { key: "tears", label: "Tear strength", min: 0, max: 1, step: .05, initial: .7, help: "Procedural highlight streaks." },
        { key: "phase", label: "Tremble phase", min: 0, max: 1, step: .05, initial: 0, help: "A chosen still frame, not a video prediction." },
    ],
    "meadow-crown": [
        { key: "size", label: "Flower size", min: .5, max: 1.6, step: .1, initial: 1, help: "Scales original drawn flowers with the head frame." },
        { key: "height", label: "Crown height", min: -.15, max: .3, step: .01, initial: .05, help: "Foreground hair stays in front where you marked it." },
        { key: "flowers", label: "Flower count", min: 3, max: 11, step: 1, initial: 7, help: "Each flower is drawn locally from original geometry." },
    ],
};
export function checkedControl(feature, key, value) {
    const definition = CONTROLS[feature]?.find(control => control.key === key);
    if (!definition || !Number.isFinite(value) || value < definition.min || value > definition.max) {
        throw new RangeError("The control value is outside this feature's supported range.");
    }
    if (definition.step === 1 && !Number.isInteger(value))
        throw new RangeError("This control needs a whole number.");
    return value;
}
export function initialControls(feature) {
    return Object.fromEntries((CONTROLS[feature] ?? []).map(control => [control.key, control.initial]));
}
//# sourceMappingURL=controls.js.map