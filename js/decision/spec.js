import { costAndLongevity, costLines, DecisionError, makeupSpec, service, services, specLines, } from "../engines/workflow_w/decision.js";
export const SHEET_FORMAT = "beljour-decision-sheet/1";
export const SHEET_LABEL = "Decision spec sheet. Previews are local simulations; prices and durations are estimates.";
export const FOOTER = (date) => `Visual aid generated ${date}. Professional assessment in person governs suitability, formula and price.`;
/** The services a sheet of this subject can price. */
export function servicesFor(subject) {
    return services().filter((row) => row.kind === subject).map((row) => row.id);
}
function text(value, limit, label) {
    if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b-\u001f]/.test(value)) {
        throw new RangeError(`${label} needs 1 to ${limit} plain text characters.`);
    }
    return value.trim();
}
/** Today, or the given ISO date when it is a real calendar day. */
function calendarDate(value) {
    const created = value ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(created) || new Date(`${created}T00:00:00Z`).toISOString().slice(0, 10) !== created) {
        throw new RangeError("Choose a valid calendar date.");
    }
    return created;
}
/** A foundation decision from a confident local shade reading (feature 101); settings only. */
export function foundationDecision(reading, options) {
    if (reading.refused || !reading.measured_lab)
        throw new RangeError(`No confident skin reading: ${reading.reason ?? "reading unavailable"}.`);
    const spec = makeupSpec(reading.measured_lab);
    const name = text(options.name, 80, "Look name"), created = calendarDate(options.date);
    const chosen = options.service ?? spec.service;
    if (service(chosen).kind !== "makeup")
        throw new DecisionError("unknown_service", `${chosen} is not a makeup service`);
    const cost = costAndLongevity(chosen, { sessions: 1, ...options.figures });
    return { format: SHEET_FORMAT, name, created, label: SHEET_LABEL, footer: FOOTER(created), subject: "makeup", spec,
        specLines: specLines(spec),
        placementLines: ["Placement: matched on the cheeks and forehead; swatch along the jaw before buying."],
        cost, costLines: costLines(cost),
        limitations: ["Reference shades are our own, not tested against real products.",
            "This sheet holds no photo: it is made from the shade reading only.",
            "Screen and printer colour calibration are unknown."],
        photos: [], photosIncluded: false, hosted: false };
}
/** UTF-8 companion text; no bytes, landmarks, masks or file names. */
export function sheetText(sheet) {
    return [`Decision spec sheet · ${sheet.name}`, sheet.label, "", "Shade", ...sheet.specLines, "", "Where it goes",
        ...sheet.placementLines, "", "Cost and how long it lasts", ...sheet.costLines, "",
        "Photos: none. Settings only.", ...sheet.limitations, sheet.footer].join("\n") + "\n";
}
//# sourceMappingURL=spec.js.map