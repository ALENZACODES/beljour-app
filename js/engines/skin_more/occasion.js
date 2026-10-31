const bundles = { interview: { id: "interview", complexion: .16, lip: .10, eye: .08, brow: .08, jewellery: 0, copy: "Restrained starting point; appearance is not competence.", assumptions: ["User can change every control."] }, date_night: { id: "date_night", complexion: .25, lip: .32, eye: .28, brow: .18, jewellery: .18, copy: "Optional stronger colour starting point; no gendered requirement.", assumptions: ["Context label describes a preset, not a rule."] }, wedding_guest: { id: "wedding_guest", complexion: .24, lip: .24, eye: .22, brow: .16, jewellery: .20, copy: "Editable guest look; avoids bridal-role assumptions.", assumptions: ["Lighting and dress colour are not inferred."] }, everyday: { id: "everyday", complexion: .12, lip: .12, eye: .10, brow: .10, jewellery: 0, copy: "Low-intensity editable starting point.", assumptions: ["No default is treated as more natural or better."] } };
function value(v) {
    if (!Number.isFinite(v) || v < 0 || v > 1)
        throw new Error("bundle control must be in [0,1]");
    return v;
}
export function bundle(name) {
    const b = bundles[name];
    if (!b)
        throw new Error("unsupported occasion bundle");
    return b;
}
export function editBundle(name, changes) {
    const base = bundle(name), out = { ...base };
    for (const [k, v] of Object.entries(changes)) {
        if (!["complexion", "lip", "eye", "brow", "jewellery"].includes(k))
            throw new Error(`unknown control ${k} `);
        out[k] = value(v);
    }
    return out;
}
export function scaleBundle(b, amount) { const a = value(amount); return { ...b, complexion: b.complexion * a, lip: b.lip * a, eye: b.eye * a, brow: b.brow * a, jewellery: b.jewellery * a }; }
export function serialiseBundle(b) { return { ...b, assumptions: [...b.assumptions], editable: true }; }
export function competenceClaim() { return false; }
export function compareBundles(a, b) { return { complexion: b.complexion - a.complexion, lip: b.lip - a.lip, eye: b.eye - a.eye, brow: b.brow - a.brow, jewellery: b.jewellery - a.jewellery }; }
export function occasionCatalogue() { return Object.keys(bundles).sort().map(k => serialiseBundle(bundles[k])); }
