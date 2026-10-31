/** W28 placement painter uses the same manual hair mask and the measured session
 * planner. Every displayed prediction remains labelled. Author: John Khan.
 */
import { h } from "../dom.js";
import { measureBaseLevel, sessionPlan } from "../engines/haircolour/balayage.js";
import { LEVELS } from "../engines/haircolour/generated/levels.js";
import { HairPainter, hairPainterSection } from "./hair-painter.js";
export function balayageScreen(editor, changed) {
    const source = editor.source;
    const section = h("section", { class: "balayage-screen", "aria-label": "Balayage Placement Painter" }, h("h2", {}, "Paint where the light goes"), h("p", { class: "fine" }, "Local simulation of session 1. Hair lightening and pigment levels are estimates, not a colour formula."));
    section.append(hairPainterSection(source.image, new HairPainter(source.image.width, source.image.height, source.hair, source.hairPaint), (hair, placement) => { editor.setHair(hair, placement); changed(); }, source.hair ? "placement" : "hair"));
    if (!source.hair)
        return section;
    let base;
    try {
        base = measureBaseLevel(source.image, source.hair.data);
    }
    catch {
        section.append(h("p", { class: "fine" }, "Mark a larger hair area to estimate its starting level."));
        return section;
    }
    section.append(h("p", { class: "fine" }, `Estimated starting hair level: ${base} of 10. Verify this with a colourist.`));
    if (base >= 10) {
        section.append(h("p", {}, "This hair is already at the top of this estimate's lightness range; no further lift is offered."));
        return section;
    }
    const target = h("select", { "aria-label": "Target hair level" }, ...LEVELS.levels.filter(row => row.level > base)
        .map(row => h("option", { value: row.level }, `${row.level} · ${row.name}`)));
    // The panel and the applied layer share one value: an existing layer's target wins, otherwise base + 2.
    const current = editor.layerFor("balayage")?.parameters.target_level;
    target.value = typeof current === "number" && current > base && current <= 10 ? String(current) : String(Math.min(10, base + 2));
    const sync = () => editor.prefer("balayage", { target_level: Number(target.value) }, `level ${target.value}`);
    const history = h("select", { "aria-label": "Hair colour history" }, h("option", { value: "colour_treated" }, "Previously coloured"), h("option", { value: "virgin" }, "Never coloured"), h("option", { value: "box_dye" }, "Box dye"));
    history.value = "colour_treated";
    const toner = h("select", { "aria-label": "Toner estimate" }, ...Object.keys(LEVELS.toners).map(id => h("option", { value: id }, id)));
    toner.value = "none";
    const status = h("p", { class: "fine", "aria-live": "polite" });
    const describe = () => {
        try {
            const plan = sessionPlan(base, Number(target.value), history.value);
            status.textContent = `ASSUMED: ${plan.sessions} session${plan.sessions === 1 ? "" : "s"}; session 1 reaches level ${plan.session_1_level}. ${plan.note}`;
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "Choose a valid lightening target.";
        }
    };
    target.addEventListener("change", () => { sync(); changed(); });
    if (!editor.layerFor("balayage"))
        sync();
    target.addEventListener("change", describe);
    history.addEventListener("change", describe);
    describe();
    const run = h("button", { type: "button", class: "btn", disabled: !source.hairPaint, onclick: () => {
            try {
                editor.add("balayage", { target_level: Number(target.value), history: history.value, toner: toner.value, softness: 4 }, 100);
                changed();
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : "The painted preview could not run.";
            }
        } }, "Preview first session");
    section.append(h("label", {}, "Target level ", target), h("label", {}, "Colour history ", history), h("label", {}, "Toner ", toner), status, run, h("p", { class: "fine" }, "A strand test and an in-person colour consultation determine suitability. Prices and outcomes need an individual assessment."));
    return section;
}
