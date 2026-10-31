/** Save System recipes (round 2 plan §8, John's spec): a look is the recipe, not the photo.
 *
 * A LookRecipe keeps every tool used, in order, with its strength, settings and provider tag
 * ("local" or "youcam"). Versions append: v1 is never changed; an edit makes v2, v3 and so on.
 * A recipe holds settings only: never a photo, face points, masks or anything measured from
 * a face, so it can be stored in this browser and shared as a small file.
 * The runtime validator (validate.ts) checks every recipe that comes from storage or a file.
 * Author: John Khan.
 */
export const RECIPE_FORMAT = "beljour-look-recipe/1";
export const MAX_STEPS = 16;
export const MAX_VERSIONS = 20;
export const MAX_SETTINGS = 20;
/** Tools a recipe may name. YouCam tools keep their provider tag so a look still loads (with a
 * local fallback or a plain "needs YouCam" note) if the adapter is removed. */
export const TOOLS = Object.freeze({
    enhance: { label: "Enhance", provider: "local" },
    "hair-fibre": { label: "Hair fibres", provider: "local" },
    beard: { label: "Beard", provider: "local" },
    posture: { label: "Posture", provider: "local" },
    filters: { label: "Filter look", provider: "local" },
    portrait: { label: "Portrait look", provider: "local" },
    older: { label: "Older", provider: "local" },
    younger: { label: "Younger", provider: "local" },
    gender: { label: "Gender appearance", provider: "local" },
    feminine: { label: "Feminine", provider: "local" },
    masculine: { label: "Masculine", provider: "local" },
    nose: { label: "Nose", provider: "local" },
    tan: { label: "Tan", provider: "local" },
    skin: { label: "Skin", provider: "local" },
    "face-makeup": { label: "Makeup on this device", provider: "local" },
    "under-eye": { label: "Under-eye", provider: "local" },
    "teeth": { label: "Teeth whitening", provider: "local" },
    "shave": { label: "Beard removal", provider: "local" },
    "grey": { label: "Grey Transition", provider: "local" },
    studio: { label: "Photo studio", provider: "local" },
    illustration: { label: "Illustration", provider: "local" },
    retouch: { label: "Retouch brushes", provider: "local" },
    lighting: { label: "Lighting", provider: "local" },
    recolour: { label: "Curl-preserving recolour", provider: "local" },
    balayage: { label: "Balayage placement", provider: "local" },
    shade: { label: "Shade match", provider: "local" },
    adjust: { label: "Adjust", provider: "local" },
    mixer: { label: "Colour mixer", provider: "local" },
    curves: { label: "Curves", provider: "local" },
    selective: { label: "Selective adjust", provider: "local" },
    crop: { label: "Crop and straighten", provider: "local" },
    makeup: { label: "Makeup", provider: "youcam" },
    "hair-style": { label: "Hair style", provider: "youcam" },
    "hair-colour": { label: "Hair colour", provider: "youcam" },
});
/** "Feminine 40 → Nose 25 → Tan 30", the auto name when she leaves the name empty. */
export function autoName(steps) {
    const text = steps.slice(0, 3).map((s) => `${TOOLS[s.tool]?.label ?? s.tool} ${Math.round(s.strength)}`).join(" → ");
    return (text || "My look").slice(0, 40);
}
export function latest(look) {
    return look.versions[look.versions.length - 1];
}
export function version(look, n) {
    const found = look.versions.find((v) => v.version === n);
    if (!found)
        throw new RangeError(`${look.name} has no version ${n}`);
    return found;
}
/** Deep copy, so callers can never edit a stored version in place. */
export function cloneSteps(steps) {
    return steps.map((s) => ({ tool: s.tool, strength: s.strength, settings: { ...s.settings }, provider: s.provider }));
}
export function cloneLook(look) {
    return { ...look, versions: look.versions.map((v) => ({ ...v, steps: cloneSteps(v.steps) })) };
}
/** A face-free id from text (FNV-1a, 32 bit), as My Looks uses. */
export function hashId(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}
