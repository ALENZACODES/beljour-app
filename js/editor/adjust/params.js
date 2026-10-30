const s = (key, label, group, min, max, hint, extra = {}) => ({ key, label, group, min, max, step: extra.step ?? 1, neutral: extra.neutral ?? 0, hint, shapes: extra.shapes });
/** The Adjust panel, in panel order. Exposure is in stops; the rest are -100..100 or 0..100. */
export const ADJUST_SLIDERS = Object.freeze([
    s("exposure", "Exposure", "Light", -3, 3, "Brightness in stops, in linear light; highlights roll off instead of clipping.", { step: 0.05 }),
    s("brilliance", "Brilliance", "Light", -100, 100, "Opens shadows and holds highlights together, following the light in the photo."),
    s("highlights", "Highlights", "Light", -100, 100, "Bright areas only. Pull left to bring back detail in a bright sky or forehead shine."),
    s("shadows", "Shadows", "Light", -100, 100, "Dark areas only. Push right to open shadows; edges stay where they are."),
    s("contrast", "Contrast", "Light", -100, 100, "An S-curve around mid grey; pure black and pure white stay put."),
    s("black_point", "Black point", "Light", -100, 100, "Right makes blacks deeper; left lifts them to a soft matte."),
    s("white_point", "White point", "Light", -100, 100, "Right makes whites brighter; left dims them."),
    s("temperature", "Temperature", "Colour", -100, 100, "Cooler to the left, warmer to the right. Brightness is held."),
    s("tint", "Tint", "Colour", -100, 100, "Green to the left, magenta to the right."),
    s("saturation", "Saturation", "Colour", -100, 100, "All colours, without pushing any colour out of range."),
    s("vibrance", "Vibrance", "Colour", -100, 100, "Muted colours most; skin tones are protected."),
    s("clarity", "Clarity", "Detail", -100, 100, "Mid-size local contrast, edge-aware, gentler on skin so faces don't turn crunchy."),
    s("sharpen", "Sharpen", "Detail", 0, 100, "Fine edges; smooth areas and noise are left alone."),
    s("noise", "Noise reduction", "Detail", 0, 100, "Smooths grain and colour speckle; edges are kept."),
    s("vignette", "Vignette", "Effects", -100, 100, "Left darkens the edges, right lightens them. Follows the crop."),
    s("vignette_mid", "Vignette midpoint", "Effects", 0, 100, "How far in the vignette starts.", { neutral: 50, shapes: "vignette" }),
    s("vignette_round", "Vignette roundness", "Effects", -100, 100, "Left is squarer, right is a circle.", { shapes: "vignette" }),
    s("grain", "Grain", "Effects", 0, 100, "Film-like grain in the mid tones; the same grain every time."),
    s("grain_size", "Grain size", "Effects", 0, 100, "Finer to the left, coarser to the right.", { neutral: 25, shapes: "grain" }),
    s("grain_rough", "Grain roughness", "Effects", 0, 100, "Smooth to the left, rough to the right.", { neutral: 50, shapes: "grain" }),
    s("fade", "Fade", "Effects", 0, 100, "Lifts the blacks and softens the whites for a faded print."),
]);
export const ADJUST_GROUPS = ["Light", "Colour", "Detail", "Effects"];
/** The eight mixer hues, with their centre on the HSV hue circle (degrees). */
export const MIXER_HUES = Object.freeze([
    { id: "red", label: "Red", centre: 0 }, { id: "orange", label: "Orange", centre: 30 },
    { id: "yellow", label: "Yellow", centre: 60 }, { id: "green", label: "Green", centre: 120 },
    { id: "aqua", label: "Aqua", centre: 180 }, { id: "blue", label: "Blue", centre: 240 },
    { id: "purple", label: "Purple", centre: 275 }, { id: "magenta", label: "Magenta", centre: 310 },
]);
export const MIXER_CHANNELS = Object.freeze([
    { id: "h", label: "Hue" }, { id: "s", label: "Saturation" }, { id: "l", label: "Luminance" },
]);
export const MIXER_RANGE = 100;
/** Skin-hue protection: on unless the layer says `skin_protect: false`. */
export const SKIN_PROTECT_KEY = "skin_protect";
export function mixerKey(hue, channel) { return `${hue}_${channel}`; }
const BY_KEY = new Map(ADJUST_SLIDERS.map((spec) => [spec.key, spec]));
export function sliderSpec(key) {
    const found = BY_KEY.get(key);
    if (!found)
        throw new RangeError(`Unknown adjustment ${key}`);
    return found;
}
/** Snap a value to a slider's range and step (the same rule the history stores). */
export function clampSlider(spec, value) {
    if (!Number.isFinite(value))
        throw new RangeError("Adjustment values must be numbers");
    const snapped = Math.round(value / spec.step) * spec.step;
    return Math.max(spec.min, Math.min(spec.max, Math.round(snapped * 1000) / 1000));
}
function num(params, key, fallback) {
    const v = params[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
/** Every Adjust value, read from sparse params (missing = neutral), before strength scaling. */
export function readAdjust(params) {
    const out = {};
    for (const spec of ADJUST_SLIDERS)
        out[spec.key] = clampSlider(spec, num(params, spec.key, spec.neutral));
    return out;
}
/** Set one slider in a copy of the params; the neutral value removes the key. */
export function withSlider(params, key, value) {
    const spec = sliderSpec(key), next = { ...params };
    const v = clampSlider(spec, value);
    if (v === spec.neutral)
        delete next[key];
    else
        next[key] = v;
    return next;
}
export function readMixer(params) {
    const values = {};
    for (const hue of MIXER_HUES)
        for (const ch of MIXER_CHANNELS) {
            const key = mixerKey(hue.id, ch.id);
            values[key] = clampSlider({ min: -MIXER_RANGE, max: MIXER_RANGE, step: 1 }, num(params, key, 0));
        }
    return { values, skinProtect: params[SKIN_PROTECT_KEY] !== false };
}
export function withMixer(params, hue, channel, value) {
    const key = mixerKey(hue, channel), next = { ...params };
    const v = clampSlider({ min: -MIXER_RANGE, max: MIXER_RANGE, step: 1 }, value);
    if (v === 0)
        delete next[key];
    else
        next[key] = v;
    return next;
}
/** Scale every value by strength/100 around its neutral (shape sliders are not scaled). */
export function scaled(values, strength) {
    const k = Math.max(0, Math.min(100, strength)) / 100, out = {};
    for (const [key, value] of Object.entries(values)) {
        const spec = BY_KEY.get(key);
        out[key] = spec?.shapes ? value : spec ? spec.neutral + (value - spec.neutral) * k : value * k;
    }
    return out;
}
/** True when the settings change nothing (shape sliders alone change nothing). */
export function adjustIsNeutral(values) {
    return ADJUST_SLIDERS.every((spec) => spec.shapes !== undefined || values[spec.key] === spec.neutral);
}
//# sourceMappingURL=params.js.map