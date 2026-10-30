import { renderLayers } from "../ui/shell/pipeline.js";
import { copyRGB } from "../ui/shell/pipeline.js";
import { photoMeanLab } from "../ui/shell/beauty-layer.js";
import { relightImage } from "../engines/shade/lighting.js";
import { measureBaseLevel, sessionPlan } from "../engines/haircolour/balayage.js";
import { findShade } from "../engines/shade/finder.js";
import { srgbToLab } from "../engines/shade/colourspace.js";
import { hexToRgb } from "../engines/core/colour.js";
export const PACK_FORMAT = "beljour-salon-pack/2";
export const PACK_LABEL = "Visual aid for a consultation. Previews are local simulations.";
export const FOOTER = (date) => `Visual aid generated ${date}. Professional assessment in person governs suitability, formula and price.`;
export function text(value, limit, label) {
    if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b-\u001f]/.test(value)) {
        throw new RangeError(`${label} needs 1 to ${limit} plain text characters.`);
    }
    return value.trim();
}
/** The visible, local look layers; an empty or cloud look is refused in plain words. */
export function activeLayers(layers) {
    const active = layers.filter(layer => layer.enabled && layer.opacity > 0 && layer.strength > 0);
    if (!active.length)
        throw new RangeError("Add a hair or makeup look before making a pack.");
    if (active.some(layer => layer.provenance === "youcam"))
        throw new RangeError("Attach the actual approved provider result before making a pack from a cloud look.");
    return active;
}
/** Each look layer's chosen settings as plain text; no pixels, masks or landmarks. */
export function layerSteps(layers) {
    return layers.map(layer => ({ tool: layer.name, strength: layer.strength,
        settings: Object.entries(layer.parameters).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join("; ").slice(0, 200) }));
}
/** Today, or the given ISO date when it is a real calendar day. */
export function calendarDate(value) {
    const created = value ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(created) || new Date(`${created}T00:00:00Z`).toISOString().slice(0, 10) !== created) {
        throw new RangeError("Choose a valid calendar date.");
    }
    return created;
}
export function labText(lab) { return `L* ${lab[0].toFixed(1)}, a* ${lab[1].toFixed(1)}, b* ${lab[2].toFixed(1)}`; }
export function buildSalonPack(source, layers, options) {
    const name = text(options.name, 80, "Look name");
    const created = calendarDate(options.date);
    const active = activeLayers(layers);
    const before = copyRGB(source.image);
    // Capture the desired appearance before applying presentation light. No simulated
    // office cast can be silently baked into the pack's daylight reference.
    const targetLayers = active.filter(layer => layer.kind !== "lighting");
    const targetImage = renderLayers(source, targetLayers).image;
    const facts = [{ label: "Original", value: `${before.width} × ${before.height} pixels, current editor resolution` }];
    const limitations = ["Reference colours are not tested against real products.",
        "No side view was supplied. This pack does not invent one.",
        "Screen and printer colour calibration are unknown.",
        "The starting photo is treated as daylight balanced."];
    if (source.kind === "sample")
        limitations.unshift("Drawn example only. This is not a person's measurement.");
    if (source.face && source.face.length >= 478) {
        const result = findShade(before, source.face);
        if (!result.refused && result.best) {
            facts.push({ label: "Skin colour", value: `${labText(result.measured_lab)}; depth ${result.depth_band}, photo-based estimate` });
            facts.push({ label: "Shade finder", value: `${result.undertone?.undertone ?? "not determined"}; local estimate, ${result.label}` });
        }
        else
            limitations.push(`No confident skin reading: ${result.reason ?? "reading unavailable"}.`);
    }
    else
        limitations.push("No verified face points: no skin depth or undertone is inferred.");
    let lab = photoMeanLab(targetImage), targetSource = "Sampled whole-photo colour, not a hair formula or product measurement";
    const recolour = [...targetLayers].reverse().find(layer => layer.kind === "recolour");
    if (recolour && typeof recolour.parameters.colour === "string") {
        lab = srgbToLab(hexToRgb(recolour.parameters.colour));
        targetSource = "Chosen hair colour swatch; cosmetic estimate, not a professional formula";
    }
    const plan = ["Price: not estimated. Request an in-person quote.",
        "Maintenance: agree a schedule with your professional.",
        "Follow the product's patch-test instructions before a colour or adhesive service."];
    if (source.hair) {
        const level = measureBaseLevel(before, source.hair.data);
        facts.push({ label: "Starting hair level", value: `${level} of 10; photo-based estimate` });
        const balayage = [...targetLayers].reverse().find(layer => layer.kind === "balayage");
        if (balayage) {
            const target = Number(balayage.parameters.target_level ?? 7);
            const history = String(balayage.parameters.history ?? "colour_treated");
            const result = sessionPlan(level, target, history);
            plan.unshift(`ASSUMED: ${result.sessions} session${result.sessions === 1 ? "" : "s"}; levels ${result.levels_by_session.join(" → ")}. ${result.note}`);
        }
    }
    const allergies = options.includeAllergies && options.allergies?.trim()
        ? text(options.allergies, 360, "Allergy note").split(/[,\n]/).map(x => x.trim()).filter(Boolean).slice(0, 12) : [];
    const description = text(options.description?.trim() || targetLayers.map(layer => layer.name).join(" + ") || "Lighting comparison", 240, "Target description");
    return { format: PACK_FORMAT, name, created, label: PACK_LABEL, footer: FOOTER(created), facts,
        target: { description, lab, source: targetSource },
        steps: layerSteps(targetLayers),
        plan, limitations, allergies,
        photos: [{ role: "original", light: "original", caption: "Your unedited photo", image: before },
            { role: "preview", light: "daylight", caption: "Local simulation, daylight", image: { ...targetImage, data: Uint8Array.from(targetImage.data) } },
            { role: "preview", light: "office", caption: "Local simulation, office light", image: { ...targetImage, data: Uint8Array.from(relightImage(targetImage, "office")) } }],
        map: source.hairPaint ? { width: source.hairPaint.width, height: source.hairPaint.height, values: Float32Array.from(source.hairPaint.data) } : null,
        hosted: false };
}
/** No bytes, landmarks, filenames or masks in the human-readable companion file. */
export function packText(pack) {
    return [`Salon Decision Pack · ${pack.name}`, pack.label, "", "Page 1 · Original and measured facts",
        ...pack.facts.map(fact => `${fact.label}: ${fact.value}`),
        ...(pack.allergies.length ? ["Allergies shared by your choice: " + pack.allergies.join(", ")] : []),
        "", "Page 2 · Target, map and plan", pack.target.description, labText(pack.target.lab), pack.target.source,
        ...pack.steps.map(step => `${step.tool}: ${step.strength} of 100; ${step.settings}`),
        ...pack.plan, "", ...pack.limitations, pack.footer].join("\n") + "\n";
}
//# sourceMappingURL=pack.js.map