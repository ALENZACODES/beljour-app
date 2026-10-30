export const GENTLE_DEFAULT = 30;
/** The highest default any effect may start at: the "Subtle" tick. */
export const GENTLE_MAX = 33;
export const STRENGTH_TICKS = [
    { name: "Subtle", value: 33 }, { name: "Normal", value: 66 }, { name: "Strong", value: 100 },
];
export const CATEGORIES = ["Skin", "Makeup", "Hair", "Grey", "Age", "Shape", "Photo", "Filters", "Body"];
function fx(id, label, category, feature, provider, built, note, extra = {}) {
    return { id, label, category, feature, provider, built, min: 0, max: 100, defaultValue: extra.defaultValue ?? GENTLE_DEFAULT,
        optIn: extra.optIn ?? false, simulation: extra.simulation ?? true, studio: extra.studio, note };
}
export const EFFECTS = [
    fx("smooth", "Smooth, texture kept", "Skin", 25, "local", true, "On this device, in Skin: spots and blotches fade, pores and marks kept. Never lightens your skin on average.", { studio: "skin" }),
    fx("blemish", "Blemishes", "Skin", 26, "local", true, "On this device, on the Skin screen: spot healing, with tap-to-heal. Moles and freckles are kept unless you mark them."),
    fx("tone", "Even tone", "Skin", 29, "local", true, "On this device. Evens colour and redness; never lightens skin. Not medical advice.", { studio: "skin" }),
    fx("freckles", "Freckles", "Skin", 104, "local", true, "On this device. Drawn freckles; your own marks are kept.", { studio: "skin" }),
    fx("tan", "Tan", "Skin", 30, "local", true, "Opt-in. Adds a tan; removing one lightens skin and needs its own tick.", { studio: "skin", optIn: true, defaultValue: 0 }),
    fx("matte", "Matte", "Skin", 105, "local", true, "On this device. Softens shine; texture kept.", { studio: "skin" }),
    fx("glow", "Glow", "Skin", 106, "local", true, "On this device. Cassis or Collioure; average skin lightness kept.", { studio: "skin" }),
    fx("dark-circles", "Dark circles", "Skin", 28, "local", true, "On this device. Matched to your own cheek, never past it; marks kept. Not medical advice.", { studio: "under-eye" }),
    fx("makeup", "Makeup", "Makeup", 33, "local", true, "On this device: lipstick, blush, eyeshadow and eyeliner from your face points; lip lines and skin texture kept. The YouCam try-on stays on its own screen.", { studio: "face-makeup" }),
    fx("makeup-youcam", "Makeup try-on (YouCam)", "Makeup", null, "youcam", true, "Sent to YouCam only after you tick the box.", { studio: "makeup" }),
    fx("eye-makeup", "Eyeshadow, liner and mascara", "Makeup", 35, "local", true, "On this device, in the Eyes, brows and art studio. Mascara coats only lashes you trace."),
    fx("foundation", "Foundation", "Makeup", 101, "local", true, "On this device, in Skin and on the Shade screen: your matched shade from jaw to hairline, never lighter than your skin.", { studio: "skin" }),
    fx("teeth", "Teeth whitening", "Makeup", 31, "local", true, "On this device. A natural cap: a few shades lighter, never paper white or blue. Not dental advice.", { studio: "teeth" }),
    fx("hair-style", "Hair style and colour", "Hair", 14, "youcam", true, "Sent to YouCam only after you tick the box.", { studio: "hair-style" }),
    fx("recolour", "Curl-preserving recolour", "Hair", 13, "local", true, "Local simulation inside your marked hair area.", { studio: "recolour" }),
    fx("balayage", "Balayage painter", "Hair", 21, "local", true, "User-painted placement with an assumed first-session lift plan.", { studio: "balayage" }),
    fx("hair-fibre", "Hair fibres", "Hair", 18, "local", true, "On this device.", { studio: "hair-fibre" }),
    fx("beard", "Beard", "Hair", 23, "local", true, "On this device.", { studio: "beard" }),
    fx("shave", "Beard removal", "Hair", 24, "local", true, "On this device. Stubble and short beards only; a full beard that hides the jaw is not removed.", { studio: "shave" }),
    fx("grey", "Grey Transition", "Grey", 102, "local", true, "On this device, in the hair you mark: cover, blend or go silver, each with what it means for upkeep.", { studio: "grey" }),
    fx("grey-removal", "Grey removal", "Grey", 20, "local", true, "On this device. Greys taken to your own natural shade, read from your hair or chosen by you.", { studio: "grey" }),
    fx("older", "Older", "Age", 2, "local", true, "Local simulation with recorded face points.", { studio: "older" }),
    fx("younger", "Younger", "Age", 3, "local", true, "Local simulation with recorded face points.", { studio: "younger" }),
    fx("gender", "Gender swap", "Age", 5, "local", true, "Face-only local simulation with recorded points.", { studio: "gender" }),
    fx("face-shape", "Face shape", "Shape", 39, "local", true, "Opt-in. On this device, on the Previews screen with the other face shape controls; not a studio layer.", { optIn: true, defaultValue: 0 }),
    fx("enhance", "Enhance", "Photo", 49, "local", true, "On this device. No detail is invented.", { studio: "enhance", simulation: false }),
    fx("lighting", "Lighting Simulator", "Photo", null, "local", true, "Daylight, Office and Evening simulations; screen colour is not calibrated.", { studio: "lighting" }),
    fx("filters", "Filters", "Filters", 67, "local", true, "On this device. Colour looks never lighten your skin.", { studio: "filters", simulation: false }),
    fx("portrait", "Portrait looks", "Filters", 107, "local", true, "Local simulation: skin polish that keeps texture and marks, gentle definition and a colour grade. Never lightens skin. Not medical advice.", { studio: "portrait" }),
    fx("background-blur", "Background blur", "Photo", 57, "local", true, "On this device, from your person area. No depth is measured; you are unchanged.", { studio: "studio", simulation: false }),
    fx("backdrop", "Backdrop", "Photo", 58, "local", true, "On this device. Thirty drawn backdrops behind your person area; no photo location is generated.", { studio: "studio", simulation: false }),
    fx("headshot", "Headshot studio", "Photo", 62, "local", true, "On this device. Backdrop, soft light, light retouch and crops; nothing is generated.", { studio: "studio" }),
    fx("authentic", "Authenticity mode", "Photo", 63, "local", true, "On this device. Light, contrast and crop only, with a Still Her check.", { studio: "studio" }),
    fx("illustration", "Illustration looks", "Filters", 83, "local", true, "On this device. Cartoon, comic, wash and painted portrait drawn from your own photo.", { studio: "illustration", simulation: false }),
    fx("retouch", "Retouch brushes", "Skin", 117, "local", true, "On this device. Heal, smooth, whiten, details, relight, blur, colour and reshape exactly where you paint; strokes undo one at a time.", { studio: "retouch" }),
    fx("posture", "Posture", "Body", null, "local", true, "Photo edit, not medical advice.", { studio: "posture" }),
    // Photo adjustment and crop (web/src/editor): every slider inside starts at no change, so a new layer changes nothing.
    fx("adjust", "Adjust", "Photo", 112, "local", true, "On this device. Light, colour, detail and effects; every slider starts at no change.", { studio: "adjust", simulation: false }),
    fx("mixer", "Colour mixer", "Photo", 113, "local", true, "On this device. Eight colours; skin tones protected unless you turn it off.", { studio: "mixer", simulation: false }),
    fx("curves", "Curves", "Photo", 114, "local", true, "On this device. RGB and per-channel curves that never invert the picture.", { studio: "curves", simulation: false }),
    fx("selective", "Selective adjust", "Photo", 116, "local", true, "On this device, only where you tap or paint.", { studio: "selective", simulation: false }),
    fx("crop", "Crop and straighten", "Photo", 115, "local", true, "On this device. Ratios, turns, flips, straighten and keystone; saved at full size.", { studio: "crop", simulation: false }),
];
/** The slider every effect shows. Opt-in effects start at 0. */
export function control(effect) {
    return { min: 0, max: 100, step: 1, value: effect.optIn ? 0 : effect.defaultValue, ticks: STRENGTH_TICKS };
}
export function effect(id) {
    const found = EFFECTS.find((e) => e.id === id);
    if (!found)
        throw new RangeError(`Unknown effect ${id}`);
    return found;
}
export function effectsIn(category) {
    return EFFECTS.filter((e) => e.category === category);
}
export function categoryOf(studio) {
    return EFFECTS.find((e) => e.studio === studio)?.category ?? null;
}
/** Where a category takes her in the studio: its first effect the studio can run. */
export function studioFor(category) {
    return effectsIn(category).find((e) => e.studio && e.built)?.studio ?? null;
}
export function clampStrength(value) {
    if (!Number.isFinite(value))
        throw new RangeError("Strength must be a number");
    return Math.max(0, Math.min(100, Math.round(value)));
}
//# sourceMappingURL=effects.js.map