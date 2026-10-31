const c = (key, label, minimum, maximum, value) => ({ key, label, minimum, maximum, default: value, editable: true });
const recipes = { W83: { id: "cycle_observation", feature: "W83", name: "Skin observation diary", controls: [c("dryness", "Dryness", 0, 1, .3), c("oiliness", "Oiliness", 0, 1, .3), c("sensitivity", "Sensitivity", 0, 1, .2)], assumptions: ["Entries are self-observations."], warnings: ["No fertility or medical prediction."], requiresHealthConsent: true },
    W84: { id: "mature_texture", feature: "W84", name: "Mature-skin texture first", controls: [c("colour", "Colour", 0, 1, .25), c("microcontrast", "Texture", 0, 1, .6)], assumptions: ["Visible texture is intentional."], warnings: ["No anti-ageing or age-reversal claim."] },
    W85: { id: "jewellery_scale", feature: "W85", name: "Jewellery scale guide", controls: [c("scale", "Scale", .5, 1.5, 1), c("shine", "Shine", 0, 1, .4)], assumptions: ["Geometry is procedural."], warnings: ["No product weight or fit guarantee."], requiresCheckedRegion: true },
    W86: { id: "glasses_fit", feature: "W86", name: "Glasses fit guide", controls: [c("width", "Frame width", .7, 1.3, 1), c("height", "Frame height", .7, 1.3, 1)], assumptions: ["Geometry is procedural."], warnings: ["No face-shape flaw score."], requiresCheckedRegion: true },
    W87: { id: "nail_colour", feature: "W87", name: "Nail colour only", controls: [c("opacity", "Opacity", 0, 1, .75)], assumptions: ["Nail region is checked by the user."], warnings: ["Shape and length remain unchanged."], requiresCheckedRegion: true },
    W88: { id: "hijab_colour", feature: "W88", name: "Scarf colour preview", controls: [c("opacity", "Colour opacity", 0, 1, .55)], assumptions: ["Scarf region is checked by the user."], warnings: ["Never reveal or remove hair."], requiresCheckedRegion: true, culturalReviewRequired: true },
    W89: { id: "occasion_bundle", feature: "W89", name: "Editable occasion bundle", controls: [c("complexion", "Complexion", 0, 1, .3), c("lip", "Lip", 0, 1, .3), c("eye", "Eye", 0, 1, .25)], assumptions: ["Presets are starting points only."], warnings: ["Interview mode does not equate makeup with competence."] },
    W90: { id: "freckle_choice", feature: "W90", name: "Freckle choice", controls: [c("density", "Faux density", 0, 1, .25)], assumptions: ["Natural freckles are preserved by default."], warnings: ["Faux marks are labelled simulation."], requiresCheckedRegion: true },
    W91: { id: "neck_chest", feature: "W91", name: "Neck and chest continuity", controls: [c("correction", "Correction", 0, .5, .15)], assumptions: ["Regions are compared within one image."], warnings: ["Lighting can dominate colour difference."], requiresCheckedRegion: true },
    W92: { id: "texture_first", feature: "W92", name: "Texture-first mature beauty", controls: [c("colour", "Colour", 0, 1, .2), c("texture", "Texture retention", .7, 1, 1)], assumptions: ["Lines and pores remain visible."], warnings: ["No age ranking or erasure goal."] } };
export function recipe(feature) {
    const r = recipes[feature];
    if (!r)
        throw new Error("unknown feature");
    return r;
}
export function defaultControls(feature) { return Object.fromEntries(recipe(feature).controls.map(x => [x.key, x.default])); }
export function validateValues(feature, values) {
    const r = recipe(feature), allowed = new Map(r.controls.map(x => [x.key, x])), result = {};
    for (const key of Object.keys(values))
        if (!allowed.has(key))
            throw new Error(`unknown control: ${key} `);
    for (const control of r.controls) {
        const value = values[control.key] ?? control.default;
        if (!Number.isFinite(value) || value < control.minimum || value > control.maximum)
            throw new Error(`${control.key}  out of range`);
        result[control.key] = value;
    }
    return result;
}
export function releaseRequirements(feature) {
    const r = recipe(feature), items = ["simulation label", "local processing"];
    if (r.requiresCheckedRegion)
        items.push("checked region");
    if (r.requiresHealthConsent)
        items.push("explicit local health-data consent");
    if (r.culturalReviewRequired)
        items.push("cultural co-design review");
    return items;
}
export function safetyCopy(feature) { return recipe(feature).warnings.join(" "); }
export function catalogue() { return Object.keys(recipes).sort().map(recipe); }
export function audit() { const rows = catalogue().map(r => ({ feature: r.feature, controls: r.controls.length, checkedRegion: !!r.requiresCheckedRegion, healthConsent: !!r.requiresHealthConsent, culturalReview: !!r.culturalReviewRequired, warnings: [...r.warnings] })); return { count: rows.length, rows, allEditable: catalogue().every(r => r.controls.every(c => c.editable)) }; }
