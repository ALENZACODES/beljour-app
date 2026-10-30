/** Read-only BELJOUR evidence panel for a shade-safety receipt (publicShadeSafety JSON).
 * The receipt is checked strictly before anything is shown. It refuses forged verified
 * claims (a product match, a passed real-face gate, provider calls or a release pass),
 * unknown reference labels, duplicate shade records, a selection the reviews disagree on,
 * and lighter references beyond the 1.0 L* allowance. One deliberate button expands the
 * details. The panel never uploads, stores or starts a purchase. Author: John Khan.
 */
import { SHADE_DATA } from "../engines/shade/generated/data.js";
import { LABEL } from "../engines/shade/shade-safety.js";
import { loadReferenceShades } from "../engines/shade/loaders.js";
const STATUS_TEXT = {
    consistent: "The lighting and nearby-reference checks agree with this shade.",
    review: "Compare by hand: the lighting or nearby references change the picture.",
    refused: "No shade is suggested for this reading.",
};
const KEYS = ["ambiguity", "format", "intent", "label", "provider_calls", "real_face_gate", "real_product_match",
    "reasons", "release_pass", "selected", "sensitivity", "status"];
function record(value, what) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new RangeError(`${what} must be an object`);
    return value;
}
function finite(value, what) {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new RangeError(`${what} must be a finite number`);
    return value;
}
/** Validate a receipt; throws RangeError for anything the panel must not display. */
export function checkShadeSafety(value) {
    const r = record(value, "Shade check");
    if (Object.keys(r).sort().join() !== KEYS.join())
        throw new RangeError("Shade check has unexpected or missing fields");
    if (r.format !== "beljour-shade-safety/1" || r.label !== LABEL)
        throw new RangeError("Unrecognised shade check format");
    if (r.intent !== "manual_only" || r.provider_calls !== 0 || r.real_product_match !== false ||
        r.real_face_gate !== "UNPROVEN" || r.release_pass !== false) {
        throw new RangeError("Shade check claims verification it cannot have");
    }
    const status = r.status;
    if (status !== "consistent" && status !== "review" && status !== "refused")
        throw new RangeError("Unknown shade check status");
    const names = new Map(loadReferenceShades().map((s) => [s.id, s]));
    const known = (id, what) => {
        if (typeof id !== "string" || !names.has(id))
            throw new RangeError(`${what} is not an in-house reference`);
        return id;
    };
    const selected = r.selected === null ? null : known(r.selected, "Selected shade");
    if ((status === "refused") !== (selected === null))
        throw new RangeError("Status and selection disagree");
    if (!Array.isArray(r.reasons) || !r.reasons.every((x) => typeof x === "string"))
        throw new RangeError("Reasons must be text");
    const sensitivity = record(r.sensitivity, "Lighting check"), ambiguity = record(r.ambiguity, "Reference check");
    for (const review of status === "refused" ? [] : [sensitivity, ambiguity]) {
        if (review.selected !== selected)
            throw new RangeError("The checks describe another shade");
    }
    const allowance = SHADE_DATA.thresholds.never_lighter_allowance;
    if (!Array.isArray(sensitivity.outcomes) || !Array.isArray(ambiguity.alternatives))
        throw new RangeError("Check details are missing");
    const modes = new Set();
    const outcomes = sensitivity.outcomes.map((raw) => {
        const o = record(raw, "Lighting outcome");
        if (typeof o.mode !== "string" || modes.has(o.mode))
            throw new RangeError("Lighting modes must be distinct");
        modes.add(o.mode);
        return { mode: o.mode, delta_e: finite(o.delta_e, "Lighting distance"), lighter_by: finite(o.lighter_by, "Lightness gap"),
            nearest: o.nearest === null ? null : known(o.nearest, "Nearest reference"), within_limits: o.within_limits === true };
    });
    const seen = new Set(selected === null ? [] : [selected]);
    const alternatives = ambiguity.alternatives.map((raw) => {
        const a = record(raw, "Nearby reference");
        const id = known(a.id, "Nearby reference");
        if (seen.has(id))
            throw new RangeError("A shade record is listed twice");
        seen.add(id);
        const lighterBy = finite(a.lighter_by, "Lightness gap");
        if (lighterBy > allowance)
            throw new RangeError("A nearby reference is lighter than the never-lighter rule allows");
        return { id, name: names.get(id).name, delta_e: finite(a.delta_e, "Reference distance"), lighter_by: lighterBy };
    });
    return { status, selected, reasons: [...r.reasons], outcomes, alternatives };
}
const MODE_TEXT = {
    neutral: "Neutral card", grey_world: "Background estimate", none: "No correction",
};
/** Build the panel; nothing is shown for a receipt that fails checkShadeSafety(). */
export function renderSkinSensitivityPanel(doc, report, commands = {}) {
    const checked = checkShadeSafety(report);
    const make = (tag, text = "") => {
        const el = doc.createElement(tag);
        if (text)
            el.textContent = text;
        return el;
    };
    const section = make("section");
    section.setAttribute("aria-label", "BELJOUR shade check");
    section.setAttribute("data-status", checked.status);
    const name = checked.selected === null ? "No shade" : loadReferenceShades().find((s) => s.id === checked.selected).name;
    section.append(make("h3", name), make("p", STATUS_TEXT[checked.status]), make("p", LABEL));
    const toggle = make("button", "Show lighting details");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("data-panel-action", "details");
    const details = make("div");
    details.hidden = true;
    const lights = make("ul");
    for (const o of checked.outcomes) {
        lights.append(make("li", `${MODE_TEXT[o.mode] ?? o.mode}: ΔE ${o.delta_e.toFixed(2)}, ` +
            `${o.within_limits ? "within" : "outside"} the shade limits`));
    }
    const nearby = make("ul");
    for (const a of checked.alternatives)
        nearby.append(make("li", `${a.name}: ΔE ${a.delta_e.toFixed(2)}`));
    details.append(make("p", "Lighting estimates"), lights, make("p", "Nearby in-house references to compare by hand"), nearby, make("p", "Provider calls: 0. Not tested against real products or on released faces."));
    toggle.addEventListener("click", () => {
        details.hidden = !details.hidden;
        toggle.setAttribute("aria-expanded", String(!details.hidden));
        toggle.textContent = details.hidden ? "Show lighting details" : "Hide lighting details";
        commands.onToggle?.(!details.hidden);
    });
    section.append(toggle, details);
    return section;
}
//# sourceMappingURL=skin-sensitivity-panel.js.map