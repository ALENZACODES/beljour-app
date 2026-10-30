import { renderLayers, copyRGB } from "../ui/shell/pipeline.js";
import { measureBaseLevel } from "../engines/haircolour/balayage.js";
import { srgbToLab } from "../engines/shade/colourspace.js";
import { hexToRgb } from "../engines/core/colour.js";
import { costAndLongevity, costLines, DecisionError, hairSpec, makeupSpec, placement, placementLines, service, services, specLines, } from "../engines/workflow_w/decision.js";
import { activeLayers, calendarDate, FOOTER, layerSteps, text } from "./pack.js";
export const SHEET_FORMAT = "beljour-decision-sheet/1";
export const SHEET_LABEL = "Decision spec sheet. Previews are local simulations; prices and durations are estimates.";
/** The services a sheet of this subject can price: hair services for hair, makeup for makeup. */
export function servicesFor(subject) {
    return services().filter((row) => row.kind === subject).map((row) => row.id);
}
function finish(subject, spec, parts, options, limitations) {
    const name = text(options.name, 80, "Look name"), created = calendarDate(options.date);
    const chosen = options.service ?? spec.service;
    if (service(chosen).kind !== subject)
        throw new DecisionError("unknown_service", `${chosen} is not a ${subject} service`);
    const sessions = chosen === spec.service && spec.subject === "hair" ? spec.sessions : 1;
    const cost = costAndLongevity(chosen, { sessions, ...options.figures });
    const photos = options.includePhotos ? parts.photos : [];
    return { format: SHEET_FORMAT, name, created, label: SHEET_LABEL, footer: FOOTER(created), subject, spec,
        specLines: specLines(spec), placement: parts.placement, placementLines: parts.placementLines, map: parts.map,
        cost, costLines: costLines(cost), steps: parts.steps,
        limitations: [...limitations, "Screen and printer colour calibration are unknown."],
        photos, photosIncluded: photos.length > 0, hosted: false };
}
/** A hair colour decision from the editor's latest local recolour or balayage layer. */
export function hairDecision(source, layers, options) {
    const active = activeLayers(layers).filter((layer) => layer.kind !== "lighting");
    const hair = [...active].reverse().find((layer) => layer.kind === "balayage" || layer.kind === "recolour");
    if (!hair)
        throw new RangeError("Add a hair colour or balayage look before making a spec sheet.");
    const before = copyRGB(source.image), p = hair.parameters;
    const baseLevel = source.hair ? measureBaseLevel(before, source.hair.data) : null;
    const balayage = hair.kind === "balayage";
    const spec = balayage
        ? hairSpec(null, { mode: "balayage", baseLevel, targetLevel: Number(p.target_level ?? 7),
            history: String(p.history ?? "colour_treated"), toner: String(p.toner ?? "none") })
        : hairSpec(srgbToLab(hexToRgb(String(p.colour))), { baseLevel });
    const paint = balayage ? source.hairPaint ?? null : null;
    let place = null, lines;
    if (!source.hair)
        lines = ["Placement: mark your hair so where the colour goes can be measured."];
    else if (balayage && !paint)
        lines = ["Placement: nothing is painted yet. Paint the placement in the balayage tool."];
    else {
        place = placement(source.hair.data, source.image.width, source.image.height, paint?.data ?? null);
        lines = placementLines(place);
    }
    const limitations = ["Shade targets use our own in-house swatches, not tested against real products."];
    if (source.kind === "sample")
        limitations.unshift("Drawn example only. This is not a person's measurement.");
    if (baseLevel === null)
        limitations.push("No hair was marked, so the starting level and sessions are not measured.");
    // Pixels are rendered only when she asked for photos; a settings-only sheet never touches them.
    const photos = [];
    if (options.includePhotos) {
        const preview = renderLayers(source, active).image;
        photos.push({ role: "original", light: "original", caption: "Your unedited photo", image: before }, { role: "preview", light: "daylight", caption: "Local simulation, daylight", image: { ...preview, data: Uint8Array.from(preview.data) } });
    }
    return finish("hair", spec, {
        placement: place, placementLines: lines, steps: layerSteps(active),
        map: paint ? { width: paint.width, height: paint.height, values: Float32Array.from(paint.data) } : null, photos,
    }, options, limitations);
}
/** A foundation decision from a confident local shade reading (feature 101); settings only. */
export function foundationDecision(reading, options) {
    if (reading.refused || !reading.measured_lab)
        throw new RangeError(`No confident skin reading: ${reading.reason ?? "reading unavailable"}.`);
    const spec = makeupSpec(reading.measured_lab);
    const limitations = ["Reference shades are our own, not tested against real products.",
        "This sheet holds no photo: it is made from the shade reading only."];
    return finish("makeup", spec, {
        placement: null, placementLines: ["Placement: matched on the cheeks and forehead; swatch along the jaw before buying."],
        map: null, steps: [], photos: [],
    }, { ...options, includePhotos: false }, limitations);
}
/** UTF-8 companion text; no bytes, landmarks, masks or file names. */
export function sheetText(sheet) {
    return [`Decision spec sheet · ${sheet.name}`, sheet.label, "", "Shade", ...sheet.specLines, "", "Where it goes",
        ...sheet.placementLines, "", "Cost and how long it lasts", ...sheet.costLines, "",
        ...(sheet.steps.length ? ["Chosen settings", ...sheet.steps.map((s) => `${s.tool}: ${s.strength} of 100; ${s.settings}`), ""] : []),
        sheet.photosIncluded ? "Photos: included by your choice, your unedited photo first." : "Photos: none. Settings only.",
        ...sheet.limitations, sheet.footer].join("\n") + "\n";
}
//# sourceMappingURL=spec.js.map